import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { GoogleLogin } from '@react-oauth/google'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function App() {
  const [token, setToken] = useState(
    window.localStorage.getItem('talkie-auth-token') || '',
  )
  const [me, setMe] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [messages, setMessages] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [friendUsername, setFriendUsername] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [error, setError] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)

  const api = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      }),
    [token],
  )

  const selectedConversation = conversations.find(
    (conversation) => conversation._id === selectedConversationId,
  )

  const pinnedMessages = messages.filter((message) => message.isPinned)

  useEffect(() => {
    if (!token) {
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
    })

    socket.on('friend:request', () => {
      fetchIncomingRequests()
    })

    socket.on('friend:accepted', () => {
      fetchConversations(true)
      fetchIncomingRequests()
    })

    socket.on('conversation:messageCreated', (message) => {
      setConversations((prev) => {
        const next = [...prev]
        const idx = next.findIndex((item) => item._id === message.conversationId)
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            lastMessage: {
              content: message.content,
              isDeletedForEveryone: message.isDeletedForEveryone,
              createdAt: message.createdAt,
            },
            lastMessageAt: message.createdAt,
          }
        }
        return next.sort(
          (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt),
        )
      })

      if (message.conversationId === selectedConversationId) {
        setMessages((prev) => {
          if (prev.some((item) => item._id === message._id)) {
            return prev
          }
          return [...prev, message]
        })
      }
    })

    socket.on('conversation:messageUpdated', (updatedMessage) => {
      if (updatedMessage.conversationId === selectedConversationId) {
        setMessages((prev) =>
          prev.map((message) =>
            message._id === updatedMessage._id ? updatedMessage : message,
          ),
        )
      }
    })

    if (selectedConversationId) {
      socket.emit('conversation:join', selectedConversationId)
    }

    return () => {
      socket.disconnect()
    }
  }, [token, selectedConversationId])

  useEffect(() => {
    if (!token) {
      return
    }

    bootstrap()
  }, [token])

  useEffect(() => {
    if (!selectedConversationId || !token) {
      return
    }

    fetchMessages(selectedConversationId)
  }, [selectedConversationId, token])

  const bootstrap = async () => {
    try {
      setError('')
      const [meRes, conversationRes, incomingRes] = await Promise.all([
        api.get('/api/users/me'),
        api.get('/api/conversations'),
        api.get('/api/friend-requests/incoming'),
      ])

      setMe(meRes.data)
      setConversations(conversationRes.data)
      setIncomingRequests(incomingRes.data)

      if (conversationRes.data.length > 0) {
        setSelectedConversationId((previous) =>
          previous || conversationRes.data[0]._id,
        )
      }
    } catch (bootstrapError) {
      setError(
        bootstrapError.response?.data?.error || 'Failed to initialize account',
      )
    }
  }

  const fetchConversations = async (preserveSelected = false) => {
    const response = await api.get('/api/conversations')
    setConversations(response.data)
    if (!preserveSelected && response.data.length > 0) {
      setSelectedConversationId(response.data[0]._id)
    }
  }

  const fetchIncomingRequests = async () => {
    const response = await api.get('/api/friend-requests/incoming')
    setIncomingRequests(response.data)
  }

  const fetchMessages = async (conversationId) => {
    try {
      setLoadingMessages(true)
      const response = await api.get(`/api/conversations/${conversationId}/messages`)
      setMessages(response.data)
    } catch (fetchError) {
      setError(fetchError.response?.data?.error || 'Failed to load messages')
    } finally {
      setLoadingMessages(false)
    }
  }

  const loginWithGoogle = async (credentialResponse) => {
    try {
      const idToken = credentialResponse.credential
      if (!idToken) {
        setError('Google login token missing')
        return
      }

      const response = await axios.post(`${API_URL}/api/auth/google`, { idToken })
      const authToken = response.data.token
      window.localStorage.setItem('talkie-auth-token', authToken)
      setToken(authToken)
      setMe(response.data.user)
      setError('')
    } catch (loginError) {
      setError(loginError.response?.data?.error || 'Google login failed')
    }
  }

  const logout = () => {
    window.localStorage.removeItem('talkie-auth-token')
    setToken('')
    setMe(null)
    setConversations([])
    setSelectedConversationId('')
    setMessages([])
    setIncomingRequests([])
    setFriendUsername('')
    setMessageInput('')
  }

  const sendFriendRequest = async (event) => {
    event.preventDefault()
    if (!friendUsername.trim()) {
      return
    }

    try {
      setError('')
      await api.post('/api/friend-requests', {
        toUsername: friendUsername.trim().toLowerCase(),
      })
      setFriendUsername('')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to send request')
    }
  }

  const respondRequest = async (requestId, action) => {
    try {
      setError('')
      await api.patch(`/api/friend-requests/${requestId}`, { action })
      await Promise.all([fetchConversations(true), fetchIncomingRequests()])
    } catch (respondError) {
      setError(respondError.response?.data?.error || 'Failed to process request')
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    const trimmed = messageInput.trim()
    if (!trimmed || !selectedConversationId) {
      return
    }

    try {
      setError('')
      await api.post(`/api/conversations/${selectedConversationId}/messages`, {
        content: trimmed,
      })
      setMessageInput('')
    } catch (sendError) {
      setError(sendError.response?.data?.error || 'Failed to send message')
    }
  }

  const deleteForMe = async (messageId) => {
    try {
      await api.patch(`/api/messages/${messageId}/delete-for-me`)
      setMessages((prev) => prev.filter((message) => message._id !== messageId))
    } catch (deleteError) {
      setError(deleteError.response?.data?.error || 'Failed to delete message')
    }
  }

  const deleteForEveryone = async (messageId) => {
    try {
      await api.patch(`/api/messages/${messageId}/delete-for-everyone`)
    } catch (deleteError) {
      setError(deleteError.response?.data?.error || 'Failed to delete message')
    }
  }

  const togglePin = async (messageId) => {
    try {
      await api.patch(`/api/messages/${messageId}/pin`)
    } catch (pinError) {
      setError(pinError.response?.data?.error || 'Failed to update pin status')
    }
  }

  const formatTime = (value) =>
    new Date(value).toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    })

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="center-shell">
        <h1>Talkie Town</h1>
        <p className="muted">
          Missing <strong>VITE_GOOGLE_CLIENT_ID</strong> in frontend .env.
        </p>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="center-shell">
        <h1>Talkie Town</h1>
        <p className="muted">Sign in with Google to continue.</p>
        <GoogleLogin onSuccess={loginWithGoogle} onError={() => setError('Google login failed')} />
        {error && <p className="error-text">{error}</p>}
      </div>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="profile-card">
          <h2>{me?.name || 'User'}</h2>
          <p>@{me?.username || 'username'}</p>
          <button onClick={logout}>Logout</button>
        </header>

        <form className="friend-form" onSubmit={sendFriendRequest}>
          <label htmlFor="friend-username">Add Friend by Username</label>
          <input
            id="friend-username"
            value={friendUsername}
            onChange={(event) => setFriendUsername(event.target.value)}
            placeholder="friend_username"
          />
          <button type="submit">Send Request</button>
        </form>

        <section className="request-panel">
          <h3>Incoming Requests</h3>
          {incomingRequests.length === 0 ? (
            <p className="muted">No pending requests</p>
          ) : (
            <ul>
              {incomingRequests.map((request) => (
                <li key={request._id}>
                  <div>
                    <strong>@{request.fromUser.username}</strong>
                    <small>{request.fromUser.name}</small>
                  </div>
                  <div className="inline-actions">
                    <button onClick={() => respondRequest(request._id, 'accept')}>
                      Accept
                    </button>
                    <button onClick={() => respondRequest(request._id, 'reject')}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="conversation-panel">
          <h3>Chats</h3>
          {conversations.length === 0 ? (
            <p className="muted">No chats yet. Add a friend first.</p>
          ) : (
            <ul>
              {conversations.map((conversation) => {
                const other = conversation.participants.find(
                  (user) => user._id !== me?.id,
                )

                return (
                  <li key={conversation._id}>
                    <button
                      className={
                        selectedConversationId === conversation._id ? 'active' : ''
                      }
                      onClick={() => setSelectedConversationId(conversation._id)}
                    >
                      <strong>@{other?.username || 'unknown'}</strong>
                      <small>
                        {conversation.lastMessage
                          ? conversation.lastMessage.content
                          : 'No messages yet'}
                      </small>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </aside>

      <main className="chat-main">
        <header className="chat-top">
          <h2>
            {selectedConversation
              ? `Chat with @${selectedConversation.participants.find((user) => user._id !== me?.id)?.username || 'friend'}`
              : 'Select a chat'}
          </h2>
        </header>

        <section className="pinned-section">
          <h3>Pinned</h3>
          {pinnedMessages.length === 0 ? (
            <p className="muted">No pinned messages in this chat</p>
          ) : (
            <ul>
              {pinnedMessages.map((message) => (
                <li key={`pin-${message._id}`}>
                  <span>{message.content}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="messages">
          {!selectedConversationId ? (
            <p className="muted">Choose a conversation to view messages.</p>
          ) : loadingMessages ? (
            <p className="muted">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="muted">No messages yet. Say hello.</p>
          ) : (
            <ul>
              {messages.map((message) => {
                const own = message.sender?._id === me?.id

                return (
                  <li key={message._id} className={own ? 'own' : ''}>
                    <div className="meta">
                      <strong>{own ? 'You' : `@${message.sender?.username || 'friend'}`}</strong>
                      <small>{formatTime(message.createdAt)}</small>
                    </div>
                    <p className={message.isDeletedForEveryone ? 'deleted' : ''}>
                      {message.content}
                    </p>
                    <div className="inline-actions">
                      <button onClick={() => togglePin(message._id)}>
                        {message.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button onClick={() => deleteForMe(message._id)}>
                        Delete for me
                      </button>
                      {own && !message.isDeletedForEveryone && (
                        <button onClick={() => deleteForEveryone(message._id)}>
                          Delete for everyone
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            placeholder={
              selectedConversationId
                ? 'Type your message...'
                : 'Select a chat to start messaging'
            }
            disabled={!selectedConversationId}
            maxLength={500}
          />
          <button type="submit" disabled={!selectedConversationId || !messageInput.trim()}>
            Send
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}
      </main>
    </div>
  )
}

export default App
