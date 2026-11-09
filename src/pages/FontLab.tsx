import '@fontsource/noto-serif-sc/400.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'

const OPTIONS = [
  {
    id: 1,
    name: '思源黑体',
    en: 'Noto Sans SC',
    cls: 'ff-sans',
    note: '当前使用。字形方正、笔画均匀，最中性，久看不累，但个性弱。',
  },
  {
    id: 2,
    name: '霞鹜文楷',
    en: 'LXGW WenKai',
    cls: 'ff-wenkai',
    note: '带笔锋的楷体风格，温和、有手写感。适合做标题和品牌感，正文小字略费眼。',
  },
  {
    id: 3,
    name: '思源宋体',
    en: 'Noto Serif SC',
    cls: 'ff-serif',
    note: '衬线，正式、有书卷气。适合报表封面，常规 UI 会显得重。',
  },
  {
    id: 4,
    name: '微软雅黑',
    en: 'Microsoft YaHei',
    cls: 'ff-yahei',
    note: 'Windows 默认，熟悉度最高，零加载成本。字形偏窄，小字容易发虚。',
  },
  {
    id: 5,
    name: '等线',
    en: 'DengXian',
    cls: 'ff-dengxian',
    note: 'Windows 自带，比雅黑瘦、更清爽，数字好看。但笔画偏细，深色下不够稳。',
  },
]

export default function FontLab() {
  return (
    <div className="fl-wrap">
      <header className="fl-head">
        <div>
          <h1>字体方案 · 选一个</h1>
          <p>同一段内容和同样的字号，只换字体。看中哪个告诉我编号，我全局替换。</p>
        </div>
        <span className="fl-badge">5 个方案</span>
      </header>

      <div className="fl-grid">
        {OPTIONS.map((o) => (
          <section className={`fl-card ${o.cls}`} key={o.id}>
            <div className="fl-top">
              <span className="fl-no">{String(o.id).padStart(2, '0')}</span>
              <div>
                <b>{o.name}</b>
                <span>{o.en}</span>
              </div>
              {o.id === 1 && <span className="fl-current">当前</span>}
            </div>

            <div className="fl-sample">
              <div className="fl-h">教培工作台</div>
              <p>
                今天两节课 · 三人待续费 · 一台无人机未归还。勾选到场学员后确认，每人扣 1 课时。
              </p>
              <div className="fl-nums">
                <span>
                  <b>12</b>名学员
                </span>
                <span>
                  <b>09:00</b>第一节课
                </span>
                <span>
                  <b>¥4,800</b>本月业绩
                </span>
              </div>
            </div>

            <p className="fl-note">{o.note}</p>
          </section>
        ))}
      </div>

      <p className="fl-foot">
        另外两个常见选择（需要额外下载字体文件，约 8–15MB）：<b>HarmonyOS Sans SC</b>（鸿蒙黑体，更圆润现代）、
        <b>MiSans</b>（小米，字面大、清晰）。要哪个也可以直接说。
      </p>
    </div>
  )
}
