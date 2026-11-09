import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Figure } from '../components/Glyphs'

const ROOM_COLORS = [
  'var(--blue)', 'var(--green)', 'var(--cream)', 'var(--pink)',
  'var(--gray)', 'var(--blue)', 'var(--cream)', 'var(--green)',
]

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [hasUser, setHasUser] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ hasUser: boolean }>('/auth/status')
      .then((d) => {
        setHasUser(d.hasUser)
        if (!d.hasUser) setMode('register')
      })
      .catch(() => setHasUser(true))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      if (password !== confirm) {
        setError('两次输入的密码不一致')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'login') await login(username.trim(), password)
      else await register(username.trim(), password, displayName.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="login">
      <div className="login-bg" aria-hidden="true">
        {ROOM_COLORS.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </div>

      <div className="login-card">
        <div className="login-brand">
          <img className="mark" src="/icon.png" alt="" />
          教培工作台
        </div>
        <p className="login-sub">
          {isRegister ? '第一次使用？建一个账号，数据都留在本机。' : '登录后查看今天的课与课时。'}
        </p>

        <form className="login-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 wanglaoshi"
              required
            />
          </div>

          {isRegister && (
            <div className="field">
              <label htmlFor="displayName">显示名（可留空）</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如 王老师"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? '至少 6 位' : '输入密码'}
              required
            />
          </div>

          {isRegister && (
            <div className="field">
              <label htmlFor="confirm">确认密码</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再输入一次"
                required
              />
            </div>
          )}

          {error && <div className="err">{error}</div>}

          <button className="pill dark" type="submit" disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? '处理中…' : isRegister ? '创建账号并进入' : '登录'}
          </button>
        </form>

        <div className="login-switch">
          {isRegister ? '已经有账号了？' : '还没有账号？'}
          <button
            type="button"
            onClick={() => {
              setError('')
              setMode(isRegister ? 'login' : 'register')
            }}
          >
            {isRegister ? '去登录' : '注册一个'}
          </button>
        </div>

        <div className="login-note">
          {hasUser === false
            ? '当前是本机第一个账号。所有学员、课时、器材数据都保存在这台电脑上，不会上传。'
            : '数据保存在本机 SQLite 文件中。忘记密码时可直接删除 data/workbench.db 重新开始（会清空数据）。'}
        </div>

        <div className="login-fig"><Figure size={72} dim /></div>
      </div>
    </div>
  )
}
