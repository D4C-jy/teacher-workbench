import { useState } from 'react'
import { api } from '../lib/api'

export interface OnboardState {
  onboarded: boolean
  dataDir: string
  defaultDataDir: string
  canPickFolder: boolean
}

/** 登录后的首次引导弹窗：设置数据位置 + 选择是否导入数据。可随时关闭跳过。 */
export default function Onboarding({ state, onDone }: { state: OnboardState; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [dataDir, setDataDir] = useState(state.dataDir)
  const [source, setSource] = useState<'demo' | 'blank'>('demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(false)

  async function pickFolder() {
    setError('')
    if (!state.canPickFolder) return
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

  async function moveTo(target: string) {
    setBusy(true)
    try {
      const r = await api<{ dataDir: string }>('/settings/move-data', { body: { targetDir: target } })
      setDataDir(r.dataDir)
      setMoved(true)
      setError('')
      // 迁移已通过 VACUUM INTO 完成并写好 location.json，下次启动自动用新位置，无需手动重启
    } catch (e) {
      setError(e instanceof Error ? e.message : '迁移失败')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    try {
      if (source === 'blank') await api('/settings/clear-data', { method: 'POST' })
      await api('/onboard-complete', { method: 'POST' })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  // 关闭弹窗 = 跳过引导，直接标记完成
  async function skip() {
    setBusy(true)
    try {
      await api('/onboard-complete', { method: 'POST' })
      onDone()
    } catch {
      onDone()
    }
  }

  const steps = ['数据位置', '开始使用']

  return (
    <div className="ob-wrap" onClick={skip}>
      <div className="ob-card" onClick={(e) => e.stopPropagation()}>
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
          <button className="ob-close" onClick={skip} aria-label="关闭" disabled={busy}>
            ×
          </button>
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
            </div>

            {moved && (
              <div className="ob-note">
                数据已复制到 <code>{dataDir}</code>，下次启动自动生效，无需重启。
              </div>
            )}
            {error && <div className="err">{error}</div>}

            <div className="ob-foot">
              <button className="pill" type="button" onClick={() => setStep(1)}>
                下一步
              </button>
            </div>
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
