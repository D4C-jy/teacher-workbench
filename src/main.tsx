import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { setToken } from './lib/api'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import './styles/app.css'

// 开发便利：允许用 ?token=xxx 直接进入，避免每次截图都手动登录
if (import.meta.env.DEV) {
  const t = new URLSearchParams(location.search).get('token')
  if (t) {
    setToken(t)
    const url = new URL(location.href)
    url.searchParams.delete('token')
    history.replaceState(null, '', url.pathname + url.search)
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
