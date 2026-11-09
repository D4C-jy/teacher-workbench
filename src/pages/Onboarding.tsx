import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export interface OnboardState {
  onboarded: boolean
  hasUser: boolean
  dataDir: string
  defaultDataDir: string
  canPickFolder: boolean
}

const STEP_KEY = 'twb.onboard.step'

export default function Onboarding({ state, onDone }: { state: OnboardState; onDone: () => void }) {
  const { register, login } = useAuth()

  // 初始 step：始终从 0（登录/创建账号）开始
  const [step, setStep] = useState(0)
  const [dataDir, setDataDir] = useState(state.dataDir)
  const [pickedAgain, setPickedAgain] = useState(false)
  const [source, setSource] = useState<'demo' | 'blank'>('demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 账号
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '' })

  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(step))
  }, [step])

  async function pickFolder() {
    setError('')
    if (state.canPickFolder) {
      try {
        const r = await api<{ path: string | null }>('/native/pick-folder', {
          body: { defaultPath: dataDir },
        })
        if (!r.path) return
        await moveTo(r.path)
      } catch (e) {
        setError(e instanceof Error ? e.message : '打开选择框失败')
      }
    }
  }

  async function moveTo(target: string) {
    setBusy(true)
    try {
      const r = await api<{ dataDir: string }>('/settings/move-data', { body: { targetDir: target } })
      setDataDir(r.dataDir)
      setPickedAgain(true)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '迁移失败')
    } finally {
      setBusy(false)
    }
  }

  async function restartNow() {
    try {
      await api('/native/relaunch', { method: 'POST' })
    } catch {
      setError('当前环境不支持自动重启，请手动关闭后重新打开')
    }
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(form.username.trim(), form.password)
      setStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('两次输入的密码不一致')
    setBusy(true)
    try {
      await register(form.username.trim(), form.password, form.displayName.trim())
      setStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    try {
      if (source === 'blank') await api('/settings/clear-data', { method: 'POST' })
      await api('/onboard-complete', { method: 'POST' })
      localStorage.removeItem(STEP_KEY)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const steps = [state.hasUser ? '登录' : '创建账号', '数据位置', '开始使用']

  return (
    <div className="ob-wrap">
      <div className="ob-card">
        <header className="ob-head">
          <div className="login-brand">
            <img className="mark" src="/icon.png" alt="" />
            教培工作台
          </div>
          <div className="ob-steps">
            {steps.map((label, i) => (
              <span key={label} className={`ob-step${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}>
                <b>{i + 1}</b>
                {label}
              </span>
            ))}
          </div>
        </header>

        {/* 第 1 步：账号 */}
        {step === 0 && (
          <section className="ob-body">
            {state.hasUser ? (
              <>
                <h2>登录你的账号</h2>
                <p className="ob-desc">这台电脑已经注册过账号，请登录后继续。</p>
                <form className="ob-form" onSubmit={doLogin}>
                  <label>
                    用户名
                    <input
                      autoFocus
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="用户名"
                      required
                    />
                  </label>
                  <label>
                    密码
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                    />
                  </label>
                  {error && <div className="err">{error}</div>}
                  <button className="pill dark" type="submit" disabled={busy}>
                    {busy ? '登录中…' : '登录'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2>先建一个账号</h2>
                <p className="ob-desc">这台电脑上用的账号，密码用 scrypt 加盐存在本机，不上传。</p>
                <form className="ob-form" onSubmit={createAccount}>
                  <label>
                    用户名
                    <input
                      autoFocus
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="例如 wanglaoshi"
                      required
                    />
                  </label>
                  <label>
                    显示名（可留空）
                    <input
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="例如 王老师"
                    />
                  </label>
                  <label>
                    密码（至少 6 位）
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    确认密码
                    <input
                      type="password"
                      value={form.confirm}
                      onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                      required
                    />
                  </label>
                  {error && <div className="err">{error}</div>}
                  <button className="pill dark" type="submit" disabled={busy}>
                    {busy ? '创建中…' : '下一步'}
                  </button>
                </form>
              </>
            )}
          </section>
        )}

        {/* 第 2 步：数据位置 */}
        {step === 1 && (
          <section className="ob-body">
            <h2>数据存在哪里</h2>
            <p className="ob-desc">
              学员、课时、课表、器材全部保存在本机的一个文件里，不联网、不上传。
              <b>建议放在非系统盘</b>（比如 D 盘），这样重装系统不会丢。
            </p>

            <div className="ob-path">
              <span className="ob-path-label">当前位置</span>
              <code>{dataDir}</code>
            </div>

            <div className="ob-actions">
              {state.canPickFolder ? (
                <button className="pill" type="button" onClick={pickFolder} disabled={busy}>
                  选择文件夹…
                </button>
              ) : (
                <>
                  <input
                    className="ob-input"
                    value={dataDir}
                    onChange={(e) => setDataDir(e.target.value)}
                    placeholder="D:\教培工作台数据"
                  />
                  <button
                    className="pill"
                    type="button"
                    onClick={() => moveTo(dataDir)}
                    disabled={busy || dataDir === state.dataDir}
                  >
                    应用
                  </button>
                </>
              )}
              <button className="pill ghost" type="button" onClick={() => setStep(2)}>
                用默认位置，下一步
              </button>
            </div>

            {pickedAgain && (
              <div className="ob-note">
                已复制到新位置。<b>需要重启一次才会生效</b>，重启后会自动回到这一步继续。
                <div style={{ marginTop: 10 }}>
                  <button className="pill dark" type="button" onClick={restartNow}>
                    立即重启
                  </button>
                </div>
              </div>
            )}

            {error && <div className="err">{error}</div>}
            {!pickedAgain && (
              <p className="ob-hint">不确定就先点右边「用默认位置」，以后在设置里也能改。</p>
            )}
          </section>
        )}

        {/* 第 3 步：数据来源 */}
        {step === 2 && (
          <section className="ob-body">
            <h2>怎么开始</h2>
            <p className="ob-desc">演示数据可以随时清空，不影响你后面自己录入。</p>

            <div className="ob-choices">
              <button
                type="button"
                className={`ob-choice${source === 'demo' ? ' on' : ''}`}
                onClick={() => setSource('demo')}
              >
                <b>先用演示数据熟悉一下</b>
                <span>12 名学员、3 个班、5 台无人机，随便点不会弄坏什么</span>
              </button>
              <button
                type="button"
                className={`ob-choice${source === 'blank' ? ' on' : ''}`}
                onClick={() => setSource('blank')}
              >
                <b>从空白开始</b>
                <span>清空演示数据，自己录学员和课表</span>
              </button>
            </div>

            {error && <div className="err">{error}</div>}

            <div className="ob-foot">
              <button className="pill" type="button" onClick={() => setStep(1)}>
                上一步
              </button>
              <button className="pill dark" type="button" onClick={finish} disabled={busy}>
                {busy ? '准备中…' : '进入工作台'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
