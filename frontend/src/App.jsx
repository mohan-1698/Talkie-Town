import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTalkie } from './context/TalkieContext'
import { Sidebar } from './components/Sidebar'
import { AuthPage } from './pages/AuthPage'
import { ChatPage } from './pages/ChatPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuickChatPage } from './pages/QuickChatPage'

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/add-friends" element={<QuickChatPage />} />
          <Route path="/quick-chat" element={<Navigate to="/add-friends" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
