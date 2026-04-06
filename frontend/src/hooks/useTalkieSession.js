import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

export function useTalkieSession() {
  const [token, setToken] = useState(window.localStorage.getItem('talkie-auth-token') || '')
  const [me, setMe] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [messages, setMessages] = useState([])
  const [friends, setFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)
  const socketRef = useRef(null)
  const selectedConversationIdRef = useRef('')

  const api = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    [token],
  )

  const logout = () => {
    window.localStorage.removeItem('talkie-auth-token')
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setSocketConnected(false)
    setToken('')
    setMe(null)
    setConversations([])
    setSelectedConversationId('')
    setMessages([])
    setFriends([])
    setIncomingRequests([])
    setError('')
  }

  const refreshConversations = async () => {
    const response = await api.get('/api/conversations')
    setConversations(response.data)
    return response.data
  }

  const refreshIncomingRequests = async () => {
    const response = await api.get('/api/friend-requests/incoming')
    setIncomingRequests(response.data)
    return response.data
  }

  const refreshFriends = async () => {
    const response = await api.get('/api/friends')
    setFriends(response.data)
    return response.data
  }

  const refreshMessages = async (conversationId) => {
    if (!conversationId) {
      setMessages([])
      return []
    }

    const response = await api.get(`/api/conversations/${conversationId}/messages`)
    setMessages(response.data)
    return response.data
  }

  const bootstrap = async () => {
    if (!token) {
      return
    }

    setLoading(true)
    try {
      const [meResponse, conversationsResponse, requestsResponse, friendsResponse] =
        await Promise.all([
          api.get('/api/users/me'),
          api.get('/api/conversations'),
          api.get('/api/friend-requests/incoming'),
          api.get('/api/friends'),
        ])

      setMe(meResponse.data)
      setConversations(conversationsResponse.data)
      setIncomingRequests(requestsResponse.data)
      setFriends(friendsResponse.data)

      const firstConversationId = conversationsResponse.data[0]?._id || ''
      setSelectedConversationId((current) => current || firstConversationId)
      if (firstConversationId) {
        await refreshMessages(firstConversationId)
      } else {
        setMessages([])
      }
    } catch (bootstrapError) {
      setError(bootstrapError.response?.data?.error || 'Failed to load your account')
      if (bootstrapError.response?.status === 401) {
        logout()
      }
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = async (credentialResponse) => {
    const idToken = credentialResponse?.credential
    if (!idToken) {
      setError('Google login token missing')
      return false
    }

    setError('')
    const response = await axios.post(`${API_URL}/api/auth/google`, { idToken })
    window.localStorage.setItem('talkie-auth-token', response.data.token)
    setToken(response.data.token)
    setMe(response.data.user)
    return true
  }

  const sendFriendRequest = async (toUsername) => {
    await api.post('/api/friend-requests', { toUsername })
    await Promise.all([refreshConversations(), refreshIncomingRequests()])
  }

  const respondToRequest = async (requestId, action) => {
    await api.patch(`/api/friend-requests/${requestId}`, { action })
    await Promise.all([refreshConversations(), refreshIncomingRequests(), refreshFriends()])
  }

  const selectConversation = async (conversationId) => {
    setSelectedConversationId(conversationId)
    if (socketRef.current && conversationId) {
      socketRef.current.emit('conversation:join', conversationId)
    }
    await refreshMessages(conversationId)
  }

  const sendMessage = async (content) => {
    if (!selectedConversationId) {
      return
    }

    const response = await api.post(`/api/conversations/${selectedConversationId}/messages`, {
      content,
    })

    setMessages((current) => [...current, response.data])
    await refreshConversations()
  }

  const deleteMessageForMe = async (messageId) => {
    await api.patch(`/api/messages/${messageId}/delete-for-me`)
    setMessages((current) => current.filter((item) => item._id !== messageId))
    await refreshConversations()
  }

  const deleteMessageForEveryone = async (messageId) => {
    const response = await api.patch(`/api/messages/${messageId}/delete-for-everyone`)
    const updatedMessage = response.data
    setMessages((current) =>
      current.map((item) => (item._id === updatedMessage._id ? updatedMessage : item)),
    )
    await refreshConversations()
  }

  const togglePinMessage = async (messageId) => {
    const response = await api.patch(`/api/messages/${messageId}/pin`)
    const updatedMessage = response.data
    setMessages((current) =>
      current.map((item) => (item._id === updatedMessage._id ? updatedMessage : item)),
    )
  }

  const updateUsername = async (username) => {
    const response = await api.patch('/api/users/me/username', { username })
    setMe((current) => (current ? { ...current, ...response.data } : response.data))
    return response.data
  }

  useEffect(() => {
    bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    if (!token) {
      return undefined
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 3000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setSocketConnected(true)
      if (selectedConversationIdRef.current) {
        socket.emit('conversation:join', selectedConversationIdRef.current)
      }
    })

    socket.on('disconnect', () => {
      setSocketConnected(false)
    })

    socket.on('friend:request', () => {
      refreshIncomingRequests()
    })

    socket.on('friend:accepted', async (payload) => {
      await Promise.all([refreshConversations(), refreshIncomingRequests(), refreshFriends()])
      if (payload?.conversationId) {
        setSelectedConversationId(payload.conversationId)
        socket.emit('conversation:join', payload.conversationId)
        await refreshMessages(payload.conversationId)
      }
    })

    socket.on('conversation:messageCreated', (message) => {
      setConversations((current) =>
        current
          .map((conversation) =>
            conversation._id === message.conversationId
              ? {
                  ...conversation,
                  lastMessage: {
                    content: message.content,
                    isDeletedForEveryone: message.isDeletedForEveryone,
                    createdAt: message.createdAt,
                  },
                  lastMessageAt: message.createdAt,
                }
              : conversation,
          )
          .sort((left, right) => new Date(right.lastMessageAt) - new Date(left.lastMessageAt)),
      )

      setMessages((current) => {
        if (message.conversationId !== selectedConversationIdRef.current) {
          return current
        }
        if (current.some((item) => item._id === message._id)) {
          return current
        }
        return [...current, message]
      })
    })

    socket.on('conversation:messageUpdated', (updatedMessage) => {
      setMessages((current) => {
        if (updatedMessage.conversationId !== selectedConversationIdRef.current) {
          return current
        }
        return current.map((item) => (item._id === updatedMessage._id ? updatedMessage : item))
      })
      refreshConversations()
    })

    return () => {
      socket.disconnect()
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      setSocketConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (socketRef.current && selectedConversationId) {
      socketRef.current.emit('conversation:join', selectedConversationId)
    }
  }, [selectedConversationId])

  return {
    api,
    token,
    setToken,
    me,
    conversations,
    friends,
    incomingRequests,
    selectedConversationId,
    messages,
    error,
    loading,
    socketConnected,
    setError,
    logout,
    loginWithGoogle,
    refreshConversations,
    refreshIncomingRequests,
    refreshFriends,
    refreshMessages,
    sendFriendRequest,
    respondToRequest,
    selectConversation,
    sendMessage,
    deleteMessageForMe,
    deleteMessageForEveryone,
    togglePinMessage,
    updateUsername,
  }
}
