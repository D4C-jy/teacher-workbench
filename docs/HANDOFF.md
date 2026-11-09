# 交接文档 · 教培工作台

> 每次完成一项任务后更新本文件，记录「做完了什么、怎么跑、下一步做什么」。
> 最新在上，旧记录保留。

---

## 当前状态（2026-11-09 · 第 7 次交接）

**版本**：v0.7（M0 → M1 → M2 → 个人中心 → M3 → 视觉修订 → **M4 设置/二维码/打包**）
**形态**：**浏览器版**（`启动工作台.bat`）+ **安装包**（`release-app/TeacherWorkbench-Setup-0.1.0.exe`，116MB）
**进度**：6 个页面**全部可用**。
**字体**：已定稿为**微软雅黑**（`Microsoft YaHei UI` 优先），所有外挂字体已移除，CSS 从 481KB 降到 32KB。

### 本轮完成（v0.6）

| # | 需求 | 状态 | 实现要点 |
|---|---|---|---|
| 1 | 人物不再纯黑块 | ✅ | SVG 分三层（头 #232323 / 身体 #1E1E1E / 手臂 #282828）+ 肩线高光 + 头部高光 |
| 2 | 人物动态效果 | ✅ | `fig-breathe` 呼吸动画（上下 1.4px + 缩放 1.02），每个座位错开相位与时长；悬停整个人上抬 2.5px；课时告急者节奏更快 |
| 3 | 去掉无人机实操区 | ✅ | 今日平面图改为四间：教室 A（占 2/3 宽）/ 器材间 / 前台 / 走廊 |
| 4 | 器材改为老师/机构取用 | ✅ | 文案全部改「取出 / 交回 / 取用人」；新增**用途**（上课/外拍/送修/调拨/其他），不再关联学生 |

### 本轮完成（v0.7）

| # | 需求 | 状态 | 实现要点 |
|---|---|---|---|
| 1 | 设置页 | ✅ | 账号 / 提醒阈值（真正生效）/ 学期开始日 / 时段增删 / 数据路径 |
| 2 | 数据备份 | ✅ | `VACUUM INTO` 生成快照直接下载 `.db`；还原=覆盖文件 |
| 3 | 二维码标签 | ✅ | `qrcode` 生成，A4 三列标签页，自动唤起打印，可另存 PDF |
| 4 | Electron 打包 | ✅ | 内嵌 Express，随机端口 4600–4799，数据落 `%APPDATA%/教培工作台/data` |
| 5 | 安装包 | ✅ | NSIS，可选安装目录，桌面 + 开始菜单快捷方式 |

### 打包说明（重要）

**标准 `npm run dist` 在本机沙箱环境下会失败**：electron-builder 解压 Electron 后要把
`win-unpacked.tmp` 改名为 `win-unpacked`，重命名报 EPERM，回退的"复制+删除"又被
删除保护拦下（78 个文件 > 阈值 50）。在普通机器上不会有这个问题。

本机采用的绕法：

```bash
# 1. 手动组装可运行目录
mkdir -p release-app/win-unpacked/resources/app
cp -r node_modules/electron/dist/* release-app/win-unpacked/
mv release-app/win-unpacked/electron.exe "release-app/win-unpacked/教培工作台.exe"
cp -r dist dist-server electron package.json release-app/win-unpacked/resources/app/

# 2. 只让 builder 做 NSIS 壳（跳过解压）
npx electron-builder --win nsis --prepackaged release-app/win-unpacked
```

产物：`release-app/TeacherWorkbench-Setup-0.1.0.exe`（116 MB）

**已知限制**：安装包未签名，首次运行会被 SmartScreen 拦一次（更多信息 → 仍要运行）；
应用图标还是 Electron 默认图标。

### 下一步（v1.0 收尾）

- 换应用图标（`.ico`）
- 器材二维码扫码查询（手机扫码后能打开对应器材详情）
- 首次启动引导（布置教室座位）
- 自动备份（每日一份，保留 14 天）

---

## 怎么跑

```bash
# 首次
npm install

# 日常（或直接双击 启动工作台.bat）
npm run dev          # 同时起 API(4317) 和 Vite(5173)，浏览器自动打开

# 生产构建
npm run build        # 输出 dist/
```

首次打开是注册页；数据落在 `data/workbench.db`（单文件 SQLite）。

### 开发便利参数（仅 DEV 生效）

| 参数 | 作用 |
|---|---|
| `?token=xxx` | 免登录直接进入（写入 localStorage 后从 URL 移除） |
| `&pick=1` | 课表自动选中第一节课 |
| `&plan=1` | 课表自动打开排课弹窗 |
| `&consume=1` | 课表自动打开消课弹窗 |

---

## 技术栈与关键决策

| 项 | 选择 | 原因 |
|---|---|---|
| 前端 | React 18 + TS + Vite 6 | 快速迭代，组件化画房间/卡片 |
| 样式 | 原生 CSS + CSS 变量 | 设计令牌集中管理，不引 Tailwind |
| 后端 | Node 22 + Express 4 | 单进程、零配置 |
| 数据库 | **node:sqlite**（Node 内置） | 本机无 MSVC，better-sqlite3 编译失败；内置模块零依赖 |
| 认证 | node:crypto scrypt + token 表 | 不引 bcrypt/jwt，减少原生依赖 |
| 字体 | **微软雅黑**（系统字体） | 用户选定，零加载成本 |
| 打包（待办） | Electron + electron-builder | 内嵌同一个 Express 服务 |

### 必须知道的坑

1. **`node:sqlite` 没有 `db.transaction()`** — 用 `server/db.ts` 里的 `tx()` 手动 BEGIN/COMMIT。
2. **rollup 可选依赖** — 若 `npm i` 后 vite 报 `Cannot find module @rollup/rollup-win32-x64-msvc`，需显式安装该包。
3. **课时余额不是字段** — 永远由 `lesson_ledger` 求和得出。seed 必须先写 charge 再写 consume，否则余额为负。
4. **课次去重靠 `rule_id`** — `ensureWeekSessions` 按 `date + rule_id` 判断，否则调课后原时段会重复补课。
5. **白底按钮在白卡片上不可见** — 侧栏等白色容器内必须用 `.tt-actions .pill` 的浅灰底样式。

---

## 数据模型（14 张表）

```
users / auth_tokens              账号与会话
courses / classes / students     课程、班级、学员
enrollments                      课时包（购买节数、有效期）
lesson_ledger                    课时流水：charge/consume/refund/adjust + amount
time_slots                       时段（排课时按需自动创建）
schedule_rules                   每周固定课表
schedule_overrides               单日覆盖（预留，暂未启用）
sessions                         课次（含 rule_id 追源）
attendance                       到场记录
equipment / equipment_loans      器材台账与借还（M3 使用）
app_config                       键值配置
```

**余额公式**：`SUM(lesson_ledger.delta) WHERE enrollment_id = ?`

---

## API 清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/status` | 是否已有账号（决定首屏是注册还是登录） |
| POST | `/api/auth/register` / `login` / `logout` | 认证 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/today` | 今日平面图数据（课次/统计/低课时/器材） |
| GET | `/api/meta` | 课程、班级、时段 |
| GET | `/api/timetable?start=` | 按周展开课表（自动补齐） |
| POST | `/api/schedule/rule` | 排每周固定课（支持 startTime/endTime） |
| POST | `/api/sessions` | 临时加一节课（支持 startTime/endTime） |
| POST | `/api/sessions/:id/status` | 停课 / 恢复 / 标记下课 |
| POST | `/api/sessions/:id/move` | 调到其他时段 |
| GET | `/api/students?q=&classId=` | 学员列表 + 统计 |
| GET | `/api/students/:id` | 学员详情 + 课时包 + 流水 |
| POST | `/api/students/:id/recharge` | 充值（lessons / amount / expireAt） |
| POST | `/api/lessons/consume` | 批量消课（同课次重复自动跳过） |
| GET | `/api/export/students.csv` | 导出（带 BOM） |
| GET | `/api/stats/monthly?month=` | 月度：课时/到课率/续费率/业绩/日粒度 |

---

## 目录结构

```
teacher-workbench/
├── 启动工作台.bat
├── server/
│   ├── index.ts        Express 路由（认证 / 今日 / 课表 / 排课 / 学员 / 统计）
│   ├── db.ts           建表 + 轻量迁移 + seed + 事务封装
│   └── auth.ts         scrypt 哈希 + token
├── src/
│   ├── pages/          Login / Today / Timetable / Students / Profile / FontLab
│   ├── layout/AppShell.tsx
│   ├── components/Glyphs.tsx   小人 + 无人机 SVG
│   ├── lib/api.ts      请求封装
│   ├── lib/auth.tsx    登录态
│   └── styles/app.css  全部样式与令牌
└── docs/HANDOFF.md     本文件
```

---

## 字体（已定稿）

`--sans: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif;`

- 用系统字体，零加载成本，CSS 体积从 481KB 降到 32KB
- 雅黑只有 Light / Regular / Bold 三档，`font-weight: 650/680` 会落到 Bold，标题偏粗属正常
- 若要换字体：改 `--sans` 并在 `src/main.tsx` 引入字体 CSS（`@fontsource/*` 包按 unicode-range 分片，体积可控）

---

## 变更记录

### 2026-11-09 · v0.8（体积优化）
- Electron 运行时裁剪：locales 从 55 个语言包只留 `zh-CN` / `en-US`（省 47.8MB），
  去掉 `dxcompiler.dll`（25.7MB）与 `electron_wer.dll`
- 结果：解压 359MB → **287MB**，安装包 116MB → **102MB**
- 新增 `scripts/pack-slim.mjs` 与 `npm run pack:slim`，把组装 + 打包固化成一条命令
- 已裁两项的副作用与回退方式见 README「已知限制」
- **无法再压的部分**：`electron.exe` 249MB（Chromium 本体）、`resources.pak` 13MB、`icudtl.dat` 11MB

如果将来真的需要 10MB 级别，只有换 Tauri（安装包 3–10MB）：
需要装 Rust + MSVC Build Tools（约 3–4GB），并把数据层从 `node:sqlite` 换成 sidecar 或 Rust 实现，
是一次较大的重写，不建议在现有版本上做。

### 2026-11-09 · v0.7
- 设置页：账号、提醒阈值（接入 `/api/today` 与 `/api/students`）、到期天数、时段增删、数据库路径
- 备份：`GET /api/backup` 用 `VACUUM INTO` 快照下载
- 器材二维码标签：A4 三列，贴机身
- Electron 打包：server 用 esbuild 打成单文件 CJS（1.2MB），Electron 主进程起服务再开窗
- 验证：`ELECTRON_RUN_AS_NODE=1` 跑打包后的服务，health 与首页均 200
- **坑**：沙箱删除保护导致 electron-builder 的目录重命名失败，改用 `--prepackaged`

### 2026-11-09 · v0.6
- 人物重绘：三层灰阶 + 高光，去掉"纯黑块"感
- 人物呼吸动画（错相位、悬停上抬、低课时节奏加快），支持 `prefers-reduced-motion`
- 删除「无人机实操区」房间，教室改为横跨两列
- 器材语义调整：借出 → 取出、归还 → 交回、借用人 → 取用人（老师/机构），新增用途字段
- `equipment_loans` 不再写 student_id；seed 与历史数据同步修正

### 2026-11-09 · v0.5
- 字体定稿微软雅黑，移除 3 个外挂字体包与字体对比页（CSS 481KB → 32KB）
- M3 器材：卡片台账、新增器材、借出/归还（含转维修）、借还历史、CSV 导出
- 新增 6 个器材接口（列表/新增/借出/归还/历史/导出）
- 修复：`equipment_loans` 插入语句引号错误导致服务启动失败
- 清理一条误建的重复排课规则

### 2026-11-09 · v0.4
- 排课时段改为双把手滑块（可自由选时间，含动效），后端按时间自动建时段
- 新增 `/font-lab` 字体对比页（5 方案）
- 充值支持「报名金额」，`lesson_ledger.amount` 字段（含老数据迁移：按 `delta × 120` 回填）
- 新增个人中心：总课时 / 到课率 / 续费率 / 业绩金额 + 每日消课柱图 + 月份切换
- 初始化 Git，建立交接文档机制

### 2026-11-09 · v0.3
- 字体换为思源黑体（@fontsource 离线分片）
- M2 学员 · 课时：列表 / 详情 / 充值 / 流水 / 消课 / 导出 CSV

### 2026-11-09 · v0.2
- 字号整体放大一档（按选择器精确设值）
- M1 课表：周视图、上下周、停课/恢复/撤销下课、调时段、排课

### 2026-11-09 · v0.1
- M0：登录注册 + 今日平面图（真实数据）+ 数据库建表
