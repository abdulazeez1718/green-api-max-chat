import { ChatApp } from './components/ChatApp/ChatApp'
import { LoginScreen } from './components/LoginScreen/LoginScreen'
import { useSessionStore } from './store/sessionStore'

export function App() {
  const credentials = useSessionStore((state) => state.credentials)
  return credentials ? (
    <ChatApp key={credentials.idInstance} credentials={credentials} />
  ) : (
    <LoginScreen />
  )
}
