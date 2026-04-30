import Login, { useAuth } from './Login.jsx'
import App from './App.jsx'

export default function AppWrapper() {
  const { user, login, logout } = useAuth()
  if (!user) return <Login onLogin={login} />
  return <App user={user} onLogout={logout} />
}
