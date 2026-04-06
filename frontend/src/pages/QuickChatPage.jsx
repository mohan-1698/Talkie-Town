import { useEffect, useState } from 'react'
import { Check, Clock, Plus, Search, Users, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'

export function QuickChatPage() {
  const { api, incomingRequests, respondToRequest, sendFriendRequest, me } = useTalkie()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState('')

  const canSearch = search.trim().length >= 2

  useEffect(() => {
    let timeoutId

    const runSearch = async () => {
      const query = search.trim()
      if (query.length < 2) {
        setResults([])
        return
      }

      setSearching(true)
      try {
        const response = await api.get('/api/users/search', {
          params: { username: query.toLowerCase() },
        })
        setResults(response.data)
      } catch (_error) {
        setResults([])
      } finally {
        setSearching(false)
      }
    }

    timeoutId = window.setTimeout(runSearch, 280)
    return () => window.clearTimeout(timeoutId)
  }, [search, api])

  const handleSendRequest = async (username) => {
    setNotice('')
    try {
      await sendFriendRequest(username)
      setNotice(`Request sent to @${username}`)
      setSearch('')
      setResults([])
    } catch (error) {
      setNotice(error.response?.data?.error || 'Could not send request')
    }
  }

  const handleResponse = async (requestId, action) => {
    setNotice('')
    try {
      await respondToRequest(requestId, action)
      setNotice(action === 'accept' ? 'Request accepted' : 'Request declined')
    } catch (error) {
      setNotice(error.response?.data?.error || 'Could not process request')
    }
  }

  return (
    <div className="page-shell">
      <motion.section
        className="hero-card quick-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <span className="eyebrow">Add friends</span>
          <h2>Send requests and connect fast</h2>
          <p>Search usernames, send friend requests, and accept incoming requests in real time.</p>
        </div>
        <div className="quick-hero-pill">
          <Users size={18} />
          <span>{me?.username ? `@${me.username}` : 'Loading profile'}</span>
        </div>
      </motion.section>

      <div className="quick-grid">
        <motion.div
          className="panel search-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">Discover</span>
              <h3>Search usernames</h3>
            </div>
            <Search size={18} />
          </div>

          <label className="field-label" htmlFor="quick-search">Username</label>
          <input
            id="quick-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="field-input"
            placeholder="Start typing a username"
          />

          <div className="results-list">
            <AnimatePresence>
              {results.map((user) => (
                <motion.div
                  className="result-row"
                  key={user._id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <div className="result-avatar">{user.username?.[0]?.toUpperCase() || 'U'}</div>
                  <div className="result-copy">
                    <strong>@{user.username}</strong>
                    <span>{user.name}</span>
                  </div>
                  <button className="icon-button" onClick={() => handleSendRequest(user.username)} type="button">
                    <Plus size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {canSearch && !searching && results.length === 0 ? (
              <div className="empty-state compact">
                No users found.
              </div>
            ) : null}

            {searching ? <div className="empty-state compact">Searching...</div> : null}
          </div>
        </motion.div>

        <motion.div
          className="panel request-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">Requests</span>
              <h3>Incoming requests</h3>
            </div>
            <Clock size={18} />
          </div>

          <div className="request-stack">
            {incomingRequests.map((request) => (
              <div className="request-card" key={request._id}>
                <div className="request-head">
                  <div className="result-avatar small">{request.fromUser.username?.[0]?.toUpperCase() || 'U'}</div>
                  <div>
                    <strong>@{request.fromUser.username}</strong>
                    <span>{request.fromUser.name}</span>
                  </div>
                </div>
                <div className="request-actions">
                  <button type="button" className="soft-button accept" onClick={() => handleResponse(request._id, 'accept')}>
                    <Check size={16} />
                    Accept
                  </button>
                  <button type="button" className="soft-button reject" onClick={() => handleResponse(request._id, 'reject')}>
                    <X size={16} />
                    Reject
                  </button>
                </div>
              </div>
            ))}

            {incomingRequests.length === 0 ? (
              <div className="empty-state compact">No incoming requests yet.</div>
            ) : null}
          </div>
        </motion.div>
      </div>

      {notice ? <div className="notice-box floating">{notice}</div> : null}
    </div>
  )
}
