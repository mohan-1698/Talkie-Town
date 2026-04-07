import { NavLink } from 'react-router-dom'
import { MessageSquare, PanelLeft, User, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'

const navItems = [
  { to: '/', label: 'Chat', icon: MessageSquare, badge: 'messages' },
  { to: '/add-friends', label: 'Add Friends', icon: UserPlus, badge: 'requests' },
  { to: '/profile', label: 'Profile', icon: User },
]

export function Sidebar() {
  const { me, logout, friends, conversations, incomingRequests, unreadByConversation, incomingMessageTotal } = useTalkie()

  const unseenCount = Object.values(unreadByConversation).reduce((sum, count) => sum + count, 0)
  const seenCount = Math.max(incomingMessageTotal - unseenCount, 0)

  return (
    <motion.aside
      className="sidebar-shell"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="brand-row">
        <div className="brand-mark">
          <PanelLeft size={18} />
          <span>Talkie Town</span>
        </div>
      </div>

      <div className="profile-chip">
        <div className="avatar">{me?.username?.[0]?.toUpperCase() || 'T'}</div>
        <div className="profile-copy">
          <strong>{me?.name || 'Guest User'}</strong>
          <span>@{me?.username || 'loading'}</span>
        </div>
      </div>

      <motion.nav className="nav-stack" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}>
        {navItems.map((item) => {
          const Icon = item.icon
          const badgeCount =
            item.badge === 'requests'
              ? incomingRequests.length
              : item.badge === 'messages'
                ? unseenCount
                : 0
          return (
            <motion.div key={item.to} variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {badgeCount > 0 ? <em className="nav-badge">{badgeCount}</em> : null}
              </NavLink>
            </motion.div>
          )
        })}
      </motion.nav>

      <motion.div
        className="sidebar-stats"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <strong>{conversations.length}</strong>
          <span>Chats</span>
        </div>
        <div>
          <strong>{friends.length}</strong>
          <span>Friends</span>
        </div>
      </motion.div>

      <div className="message-status-card">
        <div>
          <span>Seen</span>
          <strong>{seenCount}</strong>
        </div>
        <div>
          <span>Unseen</span>
          <strong>{unseenCount}</strong>
        </div>
      </div>

      <button className="logout-button" onClick={logout} type="button">
        Logout
      </button>
    </motion.aside>
  )
}
