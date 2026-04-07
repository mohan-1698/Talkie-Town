import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, MessageSquare, MoreVertical, Pin, Send, ShieldBan, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'
import { useNavigate } from 'react-router-dom'

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatPage() {
  const {
    me,
    conversations,
    messages,
    selectedConversationId,
    unreadByConversation,
    selectConversation,
    archiveConversation,
    unfriendConversation,
    blockConversation,
    sendMessage,
    deleteMessageForMe,
    deleteMessageForEveryone,
    togglePinMessage,
    setError,
  } = useTalkie()
  const navigate = useNavigate()

  const [draft, setDraft] = useState('')
  const [messageActionId, setMessageActionId] = useState('')
  const [openConversationMenuId, setOpenConversationMenuId] = useState('')
  const [conversationActionId, setConversationActionId] = useState('')
  const messageListRef = useRef(null)
  const conversationStackRef = useRef(null)
  const lastConversationRef = useRef('')
  const lastMessageCountRef = useRef(0)

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedConversationId),
    [conversations, selectedConversationId],
  )

  const partner = selectedConversation?.participants?.find((user) => user._id !== me?.id)
  const pinnedMessages = useMemo(
    () => messages.filter((message) => message.isPinned && !message.isDeletedForEveryone),
    [messages],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) {
      return
    }

    await sendMessage(content)
    setDraft('')
  }

  const runMessageAction = async (actionId, action) => {
    try {
      setMessageActionId(actionId)
      setError('')
      await action()
    } catch (actionError) {
      setError(actionError.response?.data?.error || 'Message action failed')
    } finally {
      setMessageActionId('')
    }
  }

  const runConversationAction = async (actionId, action) => {
    try {
      setConversationActionId(actionId)
      setError('')
      await action()
      setOpenConversationMenuId('')
    } catch (actionError) {
      setError(actionError.response?.data?.error || 'Conversation action failed')
    } finally {
      setConversationActionId('')
    }
  }

  useEffect(() => {
    if (!messageListRef.current || !selectedConversationId) {
      return
    }

    const switchedConversation = lastConversationRef.current !== selectedConversationId
    const messageCountIncreased = messages.length > lastMessageCountRef.current
    if (switchedConversation || messageCountIncreased) {
      messageListRef.current.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'auto' })
    }

    lastConversationRef.current = selectedConversationId
    lastMessageCountRef.current = messages.length
  }, [selectedConversationId, messages])

  useEffect(() => {
    if (!openConversationMenuId) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!conversationStackRef.current?.contains(event.target)) {
        setOpenConversationMenuId('')
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenConversationMenuId('')
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [openConversationMenuId])

  return (
    <div className="page-shell chat-shell">
      <motion.section className="hero-card chat-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <span className="eyebrow">Chat</span>
          <h2>Your conversations</h2>
          <p>Pick a conversation on the left and keep the chat focused in the main panel.</p>
        </div>
        <div className="chat-hero-pill">
          <MessageSquare size={18} />
          <span>{conversations.length} conversations</span>
        </div>
      </motion.section>

      <div className="chat-grid">
        <aside className="panel conversation-panel">
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">Inbox</span>
              <h3>Conversations</h3>
            </div>
            <button
              type="button"
              className="soft-button add-friends-inline"
              onClick={() => navigate('/add-friends')}
            >
              <UserPlus size={16} />
              Add Friends
            </button>
          </div>

          <div className="conversation-stack" ref={conversationStackRef}>
            {conversations.map((conversation) => {
              const other = conversation.participants.find((user) => user._id !== me?.id)
              return (
                <div
                  key={conversation._id}
                  className={`conversation-item ${selectedConversationId === conversation._id ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpenConversationMenuId('')
                    selectConversation(conversation._id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setOpenConversationMenuId('')
                      selectConversation(conversation._id)
                    }
                  }}
                >
                  <div className="conversation-main-row">
                    <div className="result-avatar">{other?.username?.[0]?.toUpperCase() || 'U'}</div>
                    <div className="conversation-copy">
                      <strong>@{other?.username || 'unknown'}</strong>
                      <span>{conversation.lastMessage?.content || 'No messages yet'}</span>
                    </div>
                    <div className="conversation-actions-wrap" onClick={(event) => event.stopPropagation()}>
                      {(unreadByConversation[conversation._id] || 0) > 0 ? (
                        <span className="conversation-unread-badge">{unreadByConversation[conversation._id]}</span>
                      ) : null}
                      <button
                        type="button"
                        className="conversation-menu-button"
                        onClick={() =>
                          setOpenConversationMenuId((current) =>
                            current === conversation._id ? '' : conversation._id,
                          )
                        }
                        aria-label="Conversation options"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>

                  {openConversationMenuId === conversation._id ? (
                    <div className="conversation-menu-inline" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="conversation-menu-item"
                        disabled={conversationActionId === `${conversation._id}:archive`}
                        onClick={() =>
                          runConversationAction(`${conversation._id}:archive`, () =>
                            archiveConversation(conversation._id),
                          )
                        }
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                      <button
                        type="button"
                        className="conversation-menu-item"
                        disabled={conversationActionId === `${conversation._id}:unfriend`}
                        onClick={() =>
                          runConversationAction(`${conversation._id}:unfriend`, () =>
                            unfriendConversation(conversation._id),
                          )
                        }
                      >
                        <UserMinus size={14} />
                        Unfriend
                      </button>
                      <button
                        type="button"
                        className="conversation-menu-item danger"
                        disabled={conversationActionId === `${conversation._id}:block`}
                        onClick={() =>
                          runConversationAction(`${conversation._id}:block`, () =>
                            blockConversation(conversation._id),
                          )
                        }
                      >
                        <ShieldBan size={14} />
                        Block
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {conversations.length === 0 ? <div className="empty-state">No conversations yet.</div> : null}
          </div>
        </aside>

        <section className="panel message-panel">
          {selectedConversation ? (
            <>
              <header className="message-header">
                <div className="message-partner">
                  <div className="result-avatar">{partner?.username?.[0]?.toUpperCase() || 'U'}</div>
                  <div>
                    <strong>@{partner?.username || 'friend'}</strong>
                    <span>Ready to chat</span>
                  </div>
                </div>
              </header>

              <div className="message-list" ref={messageListRef}>
                {pinnedMessages.length > 0 ? (
                  <section className="pinned-strip" aria-label="Pinned messages">
                    <span className="pinned-strip-title">Pinned</span>
                    <div className="pinned-strip-list">
                      {pinnedMessages.slice(0, 3).map((message) => (
                        <article key={`pin-${message._id}`} className="pinned-strip-item">
                          <strong>{message.sender?._id === me?.id ? 'You' : `@${message.sender?.username || 'friend'}`}</strong>
                          <p>{message.content}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {messages.map((message) => {
                  const own = message.sender?._id === me?.id
                  const isBusy = messageActionId.startsWith(`${message._id}:`)
                  return (
                    <article key={message._id} className={`message-bubble ${own ? 'own' : 'theirs'}`}>
                        <div className="message-action-row">
                          <div className="message-stamps">
                            {message.isPinned ? <span className="message-stamp pinned">PINNED</span> : null}
                            {message.isDeletedForEveryone ? <span className="message-stamp deleted">DELETED</span> : null}
                          </div>
                          <div className="message-actions">
                            <button
                              type="button"
                              className="message-mini-action"
                              onClick={() =>
                                runMessageAction(`${message._id}:pin`, () => togglePinMessage(message._id))
                              }
                              disabled={isBusy || message.isDeletedForEveryone}
                              title={message.isPinned ? 'Unpin message' : 'Pin message'}
                            >
                              <Pin size={12} />
                            </button>
                            <button
                              type="button"
                              className="message-mini-action"
                              onClick={() =>
                                runMessageAction(
                                  `${message._id}:delete`,
                                  own
                                    ? () => deleteMessageForEveryone(message._id)
                                    : () => deleteMessageForMe(message._id),
                                )
                              }
                              disabled={isBusy || message.isDeletedForEveryone}
                              title={own ? 'Delete for everyone' : 'Delete for me'}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p>{message.content}</p>
                        <footer>
                          <span>{own ? 'You' : `@${message.sender?.username || 'friend'}`}</span>
                          <span>{formatTime(message.createdAt)}</span>
                        </footer>
                    </article>
                  )
                })}
                {messages.length === 0 ? (
                  <div className="empty-state">Start the conversation with a clean first message.</div>
                ) : null}
              </div>

              <form className="composer" onSubmit={handleSubmit}>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="field-input composer-input"
                  placeholder="Write a message"
                  maxLength={500}
                />
                <button className="primary-button send-button" type="submit" disabled={!draft.trim()}>
                  <Send size={16} />
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="empty-conversation">
              <MessageSquare size={42} />
              <h3>Select a conversation</h3>
              <p>Once you add friends, your conversations will appear here.</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => navigate('/add-friends')}
              >
                <UserPlus size={16} />
                Add Friends
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
