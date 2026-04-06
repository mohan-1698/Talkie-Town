import { createContext, useContext } from 'react'
import { useTalkieSession } from '../hooks/useTalkieSession'

const TalkieContext = createContext(null)

export function TalkieProvider({ children }) {
  const session = useTalkieSession()

  return <TalkieContext.Provider value={session}>{children}</TalkieContext.Provider>
}

export function useTalkie() {
  const context = useContext(TalkieContext)
  if (!context) {
    throw new Error('useTalkie must be used inside TalkieProvider')
  }
  return context
}
