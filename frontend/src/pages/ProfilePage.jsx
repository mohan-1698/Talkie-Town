import { useMemo, useState } from 'react'
import { Copy, PencilLine, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'

function deriveUsernameHint(me) {
  const seed = (me?.name || me?.email || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || 'user'
  return seed
}

export function ProfilePage() {
  const { me, updateUsername } = useTalkie()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const suggestedUsername = useMemo(() => deriveUsernameHint(me), [me])

  const copyValue = async (value, label) => {
    if (!value) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied`)
    } catch (_error) {
      setMessage(`Could not copy ${label.toLowerCase()}`)
    }
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!draft.trim()) {
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await updateUsername(draft.trim().toLowerCase())
      setMessage('Username updated')
      setDraft('')
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not update username')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell profile-page">
      <motion.section
        className="hero-card profile-hero"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="hero-copy">
          <span className="eyebrow">Profile</span>
          <h2>Your identity in Talkie Town</h2>
          <p>
            Keep a consistent username and a simple profile view that feels calm and polished.
          </p>
        </div>

        <div className="profile-avatar-large">
          <span>{me?.username?.[0]?.toUpperCase() || 'T'}</span>
        </div>
      </motion.section>

      <div className="profile-grid">
        <motion.form
          className="panel form-panel profile-form"
          onSubmit={handleSave}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">Username</span>
              <h3>Change your handle</h3>
            </div>
            <ShieldCheck size={18} />
          </div>

          <label className="field-label" htmlFor="username">
            Current username
          </label>
          <input id="username" value={me?.username || ''} disabled className="field-input muted" />

          <label className="field-label" htmlFor="username-draft">
            New username
          </label>
          <input
            id="username-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="field-input"
            placeholder={suggestedUsername}
            minLength={3}
            maxLength={24}
          />

          <div className="hint-row profile-username-meta">
            <span>Suggested: @{suggestedUsername}</span>
            <span>Use lowercase, numbers, and underscores only</span>
          </div>

          <div className="profile-actions">
            <button
              type="button"
              className="soft-button profile-action-button"
              onClick={() => setDraft(suggestedUsername)}
            >
              Use suggestion
            </button>
            <button
              type="button"
              className="soft-button profile-action-button"
              onClick={() => copyValue(me?.username || '', 'Username')}
            >
              <Copy size={14} />
              Copy username
            </button>
            <button
              type="button"
              className="soft-button profile-action-button"
              onClick={() => copyValue(me?.email || '', 'Email')}
            >
              <Copy size={14} />
              Copy email
            </button>
          </div>

          <div className="profile-submit-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save username'}
            </button>
          </div>

          {message ? <div className="notice-box">{message}</div> : null}
        </motion.form>

        <motion.div
          className="panel info-panel profile-info"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">About</span>
              <h3>Profile details</h3>
            </div>
            <PencilLine size={18} />
          </div>

          <div className="info-list">
            <div>
              <span>Name</span>
              <strong>{me?.name || 'Unknown'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{me?.email || 'Unknown'}</strong>
            </div>
            <div>
              <span>Username rule</span>
              <strong>Deterministic and unique</strong>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
