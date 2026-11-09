import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { GlyphDefs } from '../components/Glyphs'

const NAV = [
  {
    to: '/',
    label: '今日',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>
    ),
  },
  {
    to: '/timetable',
    label: '课表',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M9 4v17M15 4v17M3 11h18" />
      </>
    ),
  },
  {
    to: '/students',
    label: '学员 · 课时',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      </>
    ),
  },
  {
    to: '/equipment',
    label: '器材',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <path d="M8 7V5h8v2M12 11v4" />
      </>
    ),
  },
  {
    to: '/profile',
    label: '个人中心',
    icon: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </>
    ),
  },
  {
    to: '/settings',
    label: '设置',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 9h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 2z" />
      </>
    ),
  },
]

const TABS = [
  { to: '/', label: '今日' },
  { to: '/timetable', label: '课表' },
  { to: '/students', label: '学员 · 课时' },
  { to: '/equipment', label: '器材' },
  { to: '/profile', label: '个人中心' },
  { to: '/settings', label: '设置' },
]

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="app">
      <GlyphDefs />

      <header className="topbar">
        <div className="logo">
          <span className="mark" />
          教培工作台
        </div>
        <span className="demo-pill">演示数据</span>
        <div className="center">
          第 <b>11</b> 周　·　{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
        </div>
        <div className="right">
          <button className="pill" type="button" onClick={() => navigate('/students')}>
            ＋ 记一笔
          </button>
          <button className="pill dark" type="button" onClick={() => navigate('/timetable')}>
            开始上课
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="rail">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `item${isActive ? ' on' : ''}`}
            >
              <svg viewBox="0 0 24 24">{n.icon}</svg>
              {n.label}
            </NavLink>
          ))}
          <div className="grow" />
          <div className="who">
            <span className="av" />
            <span>
              {user?.displayName ?? '未登录'}
              <small>本机账号</small>
            </span>
          </div>
        </nav>

        <Outlet />
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `tab${isActive ? ' on' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
        {location.pathname !== '/login' && (
          <button className="tab" type="button" onClick={() => logout()} style={{ marginLeft: 8 }}>
            退出
          </button>
        )}
      </nav>
    </div>
  )
}
