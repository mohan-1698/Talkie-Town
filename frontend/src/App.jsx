import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useTalkie } from './context/TalkieContext'
import { Sidebar } from './components/Sidebar'
import { AuthPage } from './pages/AuthPage'
import { ChatPage } from './pages/ChatPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuickChatPage } from './pages/QuickChatPage'

function AppShell() {
  const location = useLocation()

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="route-frame"
            initial={{ opacity: 0, y: 12, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.995 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<ChatPage />} />
              <Route path="/add-friends" element={<QuickChatPage />} />
              <Route path="/quick-chat" element={<Navigate to="/add-friends" replace />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function App() {
  const { token, loginWithGoogle, error, setError } = useTalkie()

  if (!token) {
    return <AuthPage onSuccess={loginWithGoogle} onError={setError} authError={error} />
  }

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
