import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import './App.css'
import App from './App.jsx'
import { TalkieProvider } from './context/TalkieContext'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <TalkieProvider>
        <App />
      </TalkieProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
