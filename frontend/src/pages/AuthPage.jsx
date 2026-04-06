import { GoogleLogin } from '@react-oauth/google'
import { ArrowRight, Sparkles, ShieldCheck, MessageSquare } from 'lucide-react'
import { motion } from 'framer-motion'

export function AuthPage({ onSuccess, onError, authError }) {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

  return (
    <div className="auth-page">
      <div className="auth-glow auth-glow-left" />
      <div className="auth-glow auth-glow-right" />

      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <div className="auth-badge">
          <MessageSquare size={18} />
          <span>Real-time town chat</span>
        </div>

        <h1>Talkie Town</h1>
        <p className="auth-copy">
          A smooth, modern place for chatting, quick discovery, and profiles that stay clean and easy to use.
        </p>

        <div className="feature-grid">
          <div className="feature-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Safe sign-in</strong>
              <span>Google auth with backend session storage</span>
            </div>
          </div>
          <div className="feature-card">
            <Sparkles size={20} />
            <div>
              <strong>Smooth flow</strong>
              <span>Subtle motion and a clean dark theme</span>
            </div>
          </div>
        </div>

        {googleClientId ? (
          <div className="auth-action">
            <GoogleLogin
              onSuccess={onSuccess}
              onError={() => onError('Google login failed')}
              shape="pill"
              theme="filled_black"
            />
          </div>
        ) : (
          <div className="warning-box">
            Set <strong>VITE_GOOGLE_CLIENT_ID</strong> in your frontend env to enable login.
          </div>
        )}

        {authError ? <div className="error-box">{authError}</div> : null}

        <div className="auth-footer">
          <span>Step 1: sign in</span>
          <ArrowRight size={16} />
          <span>Step 2: chat</span>
          <ArrowRight size={16} />
          <span>Step 3: profile</span>
        </div>
      </motion.section>
    </div>
  )
}
