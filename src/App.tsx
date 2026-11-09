import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import AppShell from './layout/AppShell'
import Login from './pages/Login'
import Today from './pages/Today'
import Timetable from './pages/Timetable'
import Students from './pages/Students'
import Equipment from './pages/Equipment'
import Classes from './pages/Classes'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Onboarding, { type OnboardState } from './pages/Onboarding'

/** 登录后，首次启动弹引导（数据位置 + 导入数据），完成后再进正常界面 */
function Protected() {
  const { user, loading } = useAuth()
  const [onboard, setOnboard] = useState<OnboardState | null>(null)

  useEffect(() => {
    fetch('/api/onboard-state')
      .then((r) => r.json())
      .then((d) => setOnboard({ onboarded: d.onboarded, dataDir: d.dataDir, defaultDataDir: d.defaultDataDir, canPickFolder: d.canPickFolder }))
      .catch(() => setOnboard({ onboarded: true, dataDir: '', defaultDataDir: '', canPickFolder: false }))
  }, [])

  if (loading) return <div className="loading">加载中…</div>
  if (!user) return <Navigate to="/login" replace />

  // 未完成引导：在 AppShell 之上叠加引导弹窗
  const showOnboarding = onboard !== null && !onboard.onboarded

  return (
    <>
      <AppShell />
      {showOnboarding && (
        <Onboarding state={onboard} onDone={() => setOnboard({ ...onboard, onboarded: true })} />
      )}
    </>
  )
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">加载中…</div>
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Today />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/students" element={<Students />} />
        <Route path="/classes" element={<Classes />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
