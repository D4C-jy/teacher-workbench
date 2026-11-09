import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import AppShell from './layout/AppShell'
import Login from './pages/Login'
import Today from './pages/Today'
import Placeholder from './pages/Placeholder'
import Timetable from './pages/Timetable'
import Students from './pages/Students'
import FontLab from './pages/FontLab'
import Profile from './pages/Profile'

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Today />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/students" element={<Students />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/equipment"
          element={<Placeholder title="器材" desc="无人机台账、借还记录、二维码标签。M3 实现。" />}
        />
        <Route
          path="/settings"
          element={<Placeholder title="设置" desc="时段、提醒阈值、备份与恢复。M4 实现。" />}
        />
      </Route>
      <Route path="/font-lab" element={<FontLab />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
