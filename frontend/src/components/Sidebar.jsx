import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MessageSquare, PanelLeft, User, UserPlus } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTalkie } from '../context/TalkieContext'

const navItems = [
  { to: '/', label: 'Chat', icon: MessageSquare },
  { to: '/add-friends', label: 'Add Friends', icon: UserPlus, badge: 'requests' },
  { to: '/profile', label: 'Profile', icon: User },
]

export function Sidebar() {
  const { me, logout, friends, conversations, incomingRequests } = useTalkie()
  const [collapsed, setCollapsed] = useState(true)

  return (
    <motion.aside
      className={`sidebar-shell ${collapsed ? 'collapsed' : ''}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="brand-row">
        <div className="brand-mark">
          <PanelLeft size={18} />
          <span>Talkie Town</span>
        </div>
        <button
          type="button"
          className="icon-button sidebar-toggle"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
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
          const badgeCount = item.badge === 'requests' ? incomingRequests.length : 0
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

      <button className="logout-button" onClick={logout} type="button">
        Logout
      </button>
    </motion.aside>
  )
}
