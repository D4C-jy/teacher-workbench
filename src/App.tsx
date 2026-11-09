import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import AppShell from './layout/AppShell'
import Login from './pages/Login'
import Today from './pages/Today'
import Placeholder from './pages/Placeholder'
import Timetable from './pages/Timetable'
import Students from './pages/Students'
import Equipment from './pages/Equipment'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Onboarding, { type OnboardState } from './pages/Onboarding'

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return <AppShell />
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">加载中…</div>
  if (user) return <Navigate to="/" replace />
  return <Login />
}

/** 首次启动先走引导，完成后再进正常界面 */
function Gate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OnboardState | null>(null)

  useEffect(() => {
    fetch('/api/onboard-state')
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ onboarded: true, hasUser: true, dataDir: '', defaultDataDir: '', canPickFolder: false }))
  }, [])

  if (!state) return <div className="loading">加载中…</div>
  if (!state.onboarded) return <Onboarding state={state} onDone={() => setState({ ...state, onboarded: true })} />
  return <>{children}</>
}

export default function App() {
  return (
    <Gate>
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Today />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/students" element={<Students />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Gate>
  )
}
