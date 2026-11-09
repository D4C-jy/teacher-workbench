import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export interface OnboardState {
  onboarded: boolean
  dataDir: string
  defaultDataDir: string
  canPickFolder: boolean
}

const STEP_KEY = 'twb.onboard.step'

/** 登录后的首次引导：设置数据位置 + 选择是否导入数据。不含账号登录。 */
export default function Onboarding({ state, onDone }: { state: OnboardState; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [dataDir, setDataDir] = useState(state.dataDir)
  const [pickedAgain, setPickedAgain] = useState(false)
  const [source, setSource] = useState<'demo' | 'blank'>('demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  const steps = ['数据位置', '开始使用']

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

        {/* 第 1 步：数据位置 */}
        {step === 0 && (
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
              <button className="pill ghost" type="button" onClick={() => setStep(1)}>
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

        {/* 第 2 步：数据来源 */}
        {step === 1 && (
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
              <button className="pill" type="button" onClick={() => setStep(0)}>
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
