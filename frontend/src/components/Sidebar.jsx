import { NavLink } from 'react-router-dom'
import { MessageSquare, PanelLeft, User, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'

const navItems = [
  { to: '/', label: 'Chat', icon: MessageSquare },
  { to: '/add-friends', label: 'Add Friends', icon: UserPlus, badge: 'requests' },
  { to: '/profile', label: 'Profile', icon: User },
]

export function Sidebar() {
  const { me, logout, friends, conversations, incomingRequests } = useTalkie()

  return (
    <aside className="sidebar-shell">
      <div className="brand-mark">
        <PanelLeft size={18} />
        <span>Talkie Town</span>
      </div>

      <div className="profile-chip">
        <div className="avatar">{me?.username?.[0]?.toUpperCase() || 'T'}</div>
        <div className="profile-copy">
          <strong>{me?.name || 'Guest User'}</strong>
          <span>@{me?.username || 'loading'}</span>
        </div>
      </div>

      <nav className="nav-stack">
        {navItems.map((item) => {
          const Icon = item.icon
          const badgeCount = item.badge === 'requests' ? incomingRequests.length : 0
          return (
            <NavLink
              key={item.to}
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
          )
        })}
      </nav>

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

      <button className="logout-button" onClick={logout} type="button">
        Logout
      </button>
    </aside>
  )
}
