import { useState } from 'react'
import { auth } from './api'

interface LoginProps { onSuccess: (username: string) => void }

export default function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) { setError('请填写用户名和密码'); return }
    setError(''); setLoading(true)
    try {
      const res = isRegister ? await auth.register(username, password) : await auth.login(username, password)
      onSuccess(res.user.username)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf7f2', fontFamily: "'IBM Plex Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      <div style={{ width: 360, padding: '48px 40px', background: '#f5f0e8', borderRadius: 16, border: '1px solid rgba(120,100,80,0.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 42, color: '#2c2419', opacity: 0.3, marginBottom: 8 }}>墨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Noto Serif SC', serif", color: '#2c2419', margin: 0 }}>Inkwell</h1>
          <div style={{ fontSize: 11, color: '#b8ab9a', marginTop: 8 }}>{isRegister ? '创建账号' : '登录以继续'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="用户名" autoFocus
            style={{ padding: '12px 16px', border: '1px solid rgba(120,100,80,0.2)', borderRadius: 10, background: '#faf7f2', fontSize: 14, color: '#2c2419', outline: 'none', fontFamily: 'inherit' }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="密码"
            style={{ padding: '12px 16px', border: '1px solid rgba(120,100,80,0.2)', borderRadius: 10, background: '#faf7f2', fontSize: 14, color: '#2c2419', outline: 'none', fontFamily: 'inherit' }} />
          {error && <div style={{ fontSize: 12, color: '#c0392b', textAlign: 'center' }}>{error}</div>}
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding: '12px 0', border: 'none', borderRadius: 10, background: '#bf6a3d', color: '#fff', fontSize: 14, fontFamily: "'Noto Serif SC', serif", fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '请稍候…' : isRegister ? '注 册' : '登 录'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={() => { setIsRegister(!isRegister); setError('') }}
            style={{ background: 'none', border: 'none', color: '#bf6a3d', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
      </div>
    </div>
  )
}
