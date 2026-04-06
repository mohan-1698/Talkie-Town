import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, MessageSquare, MoreVertical, Send, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
    selectConversation,
    sendMessage,
    refreshMessages,
  } = useTalkie()
  const navigate = useNavigate()

  const [draft, setDraft] = useState('')
  const [conversationLoading, setConversationLoading] = useState(false)

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation._id === selectedConversationId),
    [conversations, selectedConversationId],
  )

  const partner = selectedConversation?.participants?.find((user) => user._id !== me?.id)

  useEffect(() => {
    if (!selectedConversationId) {
      return undefined
    }

    let mounted = true
    setConversationLoading(true)
    refreshMessages(selectedConversationId)
      .catch(() => {})
      .finally(() => {
        if (mounted) {
          setConversationLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [selectedConversationId, refreshMessages])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) {
      return
    }

    await sendMessage(content)
    setDraft('')
  }

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

          <div className="conversation-stack">
            {conversations.map((conversation) => {
              const other = conversation.participants.find((user) => user._id !== me?.id)
              return (
                <button
                  key={conversation._id}
                  type="button"
                  className={`conversation-item ${selectedConversationId === conversation._id ? 'active' : ''}`}
                  onClick={() => selectConversation(conversation._id)}
                >
                  <div className="result-avatar">{other?.username?.[0]?.toUpperCase() || 'U'}</div>
                  <div className="conversation-copy">
                    <strong>@{other?.username || 'unknown'}</strong>
                    <span>{conversation.lastMessage?.content || 'No messages yet'}</span>
                  </div>
                </button>
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
                <button type="button" className="icon-button">
                  <MoreVertical size={18} />
                </button>
              </header>

              <div className="message-list">
                <AnimatePresence>
                  {messages.map((message) => {
                    const own = message.sender?._id === me?.id
                    return (
                      <motion.article
                        key={message._id}
                        className={`message-bubble ${own ? 'own' : 'theirs'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                      >
                        <p>{message.content}</p>
                        <footer>
                          <span>{own ? 'You' : `@${message.sender?.username || 'friend'}`}</span>
                          <span>{formatTime(message.createdAt)}</span>
                        </footer>
                      </motion.article>
                    )
                  })}
                </AnimatePresence>

                {conversationLoading ? <div className="empty-state">Loading messages...</div> : null}
                {!conversationLoading && messages.length === 0 ? (
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
