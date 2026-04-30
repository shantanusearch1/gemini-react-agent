import { useState } from 'react'

const USERS = [
  { username: 'admin', password: 'shan@2024', role: 'admin', name: 'Admin User' },
  { username: 'shantanu', password: 'steel@123', role: 'user', name: 'Shantanu' },
  { username: 'operator', password: 'bof@2024', role: 'operator', name: 'BOF Operator' },
]

const M = {
  primary: '#1565C0', primaryLight: '#1976D2',
  surface: '#FFFFFF', background: '#ECEFF1',
  outline: '#E0E0E0', onSurface: '#212121',
  onSurfaceVariant: '#757575', error: '#B00020',
  errorSurface: '#FDECEA', steelDark: '#263238',
  success: '#2E7D32',
}

export function useAuth() {
  const stored = sessionStorage.getItem('shan_auth')
  const [user, setUser] = useState(stored ? JSON.parse(stored) : null)

  const login = (username, password) => {
    const found = USERS.find(u => u.username === username && u.password === password)
    if (found) {
      const userData = { username: found.username, name: found.name, role: found.role }
      sessionStorage.setItem('shan_auth', JSON.stringify(userData))
      setUser(userData)
      return true
    }
    return false
  }

  const logout = () => {
    sessionStorage.removeItem('shan_auth')
    setUser(null)
  }

  return { user, login, logout }
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async () => {
    if (!username || !password) { setError('Please enter username and password'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    const ok = onLogin(username, password)
    if (!ok) setError('Invalid username or password')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: M.steelDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Roboto, sans-serif' }}>
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#7c3aed,#1565C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(124,58,237,0.3)' }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>S</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>Shan Agent</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>AI Development Assistant · Sign in to continue</div>
        </div>

        {/* Card */}
        <div style={{ background: M.surface, borderRadius: 12, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: M.onSurface, marginBottom: 24 }}>Sign In</div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: M.errorSurface, border: '1px solid #FFCDD2', borderRadius: 6, marginBottom: 16, fontSize: 13, color: M.error }}>
              <span className="material-icons" style={{ fontSize: 16 }}>error</span>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Username</label>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${M.outline}`, borderRadius: 6, overflow: 'hidden', background: '#F8F9FA' }}>
                <span className="material-icons" style={{ fontSize: 18, color: M.onSurfaceVariant, padding: '0 10px' }}>person</span>
                <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter username"
                  style={{ flex: 1, padding: '11px 12px 11px 0', border: 'none', outline: 'none', fontSize: 14, color: M.onSurface, background: 'transparent', fontFamily: 'Roboto, sans-serif' }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Password</label>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${M.outline}`, borderRadius: 6, overflow: 'hidden', background: '#F8F9FA' }}>
                <span className="material-icons" style={{ fontSize: 18, color: M.onSurfaceVariant, padding: '0 10px' }}>lock</span>
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter password"
                  style={{ flex: 1, padding: '11px 0', border: 'none', outline: 'none', fontSize: 14, color: M.onSurface, background: 'transparent', fontFamily: 'Roboto, sans-serif' }} />
                <button onClick={() => setShowPass(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 10px', color: M.onSurfaceVariant }}>
                  <span className="material-icons" style={{ fontSize: 18 }}>{showPass ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', padding: '13px', borderRadius: 6, border: 'none', background: loading ? '#BDBDBD' : 'linear-gradient(135deg,#7c3aed,#1565C0)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Roboto, sans-serif', letterSpacing: '0.04em', boxShadow: loading ? 'none' : '0 4px 12px rgba(124,58,237,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <><span className="material-icons" style={{ fontSize: 18, animation: 'spin 0.7s linear infinite' }}>refresh</span> Signing in...</> : <><span className="material-icons" style={{ fontSize: 18 }}>login</span> Sign In</>}
          </button>

          <div style={{ marginTop: 20, padding: '12px 14px', background: '#F3F4F6', borderRadius: 6, border: '1px solid #E0E0E0' }}>
            <div style={{ fontSize: 11, color: M.onSurfaceVariant, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}> Credentials</div>
            {[
              { u: 'admin', p: '', r: 'Admin' },              
            ].map(c => (
              <div key={c.u} style={{ display: 'flex', gap: 8, fontSize: 12, color: M.onSurfaceVariant, marginBottom: 3, fontFamily: 'Roboto Mono, monospace', cursor: 'pointer' }}
                onClick={() => { setUsername(c.u); setPassword(c.p); setError('') }}>
                <span style={{ color: M.primary, width: 70 }}>{c.u}</span>
                <span>{c.p}</span>
                <span style={{ marginLeft: 'auto', background: '#E8EAF6', color: '#3949AB', padding: '0 6px', borderRadius: 8, fontSize: 10 }}>{c.r}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Shan Agent · Internal Tool · Confidential
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
