# 交接文档 · 教培工作台

> 每次完成一项任务后更新本文件，记录「做完了什么、怎么跑、下一步做什么」。
> 最新在上，旧记录保留。

---

## 当前状态（2026-11-09 · 第 4 次交接）

**版本**：v0.4（M0 骨架 → M1 课表 → M2 学员课时 → 个人中心 + 排课增强）
**形态**：浏览器版（双击 `启动工作台.bat`）
**进度**：6 个页面中 4 个可用；器材与设置仍是占位。

### 本轮完成

| # | 需求 | 状态 | 实现要点 |
|---|---|---|---|
| 1 | 排课时段可自由拖动 | ✅ | 双把手滑块（07:00–22:00，15 分钟步长），中间高亮区间带过渡动效；提交时按 startTime/endTime 自动建时段 |
| 2 | 字体 5 方案 | ⏳ 待用户选 | `/font-lab` 页面并列渲染 5 种真实字体 |
| 3 | 续费加报名金额 | ✅ | `lesson_ledger.amount` 字段 + 充值弹窗输入框 |
| 4 | 个人中心 | ✅ | 月度到课率/续费率/总课时/业绩金额 + 每日消课柱状图 + 月份切换 |
| 5 | Git 版本管理 | ✅ | 仓库已初始化，`.gitignore` 排除 node_modules / data / dist |
| 6 | 交接文档 | ✅ | 本文件 |

### 下一步（M3 器材）

- 无人机台账（编号 / 型号 / 状态：在库·借出·维修）
- 借出与归还留痕（借用人、关联课次、机况备注）
- 二维码标签打印
- 台账导出 CSV
- 之后：设置页（时段管理、备份恢复）→ Electron 打包

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
| 字体 | Noto Sans SC（@fontsource） | 见「字体方案」一节 |
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

## 字体方案（待用户选择）

`/font-lab` 页面并列 5 种：

| 编号 | 字体 | 特点 |
|---|---|---|
| 1 | 思源黑体 Noto Sans SC | 当前，方正中性 |
| 2 | 霞鹜文楷 LXGW WenKai | 带笔锋，温和有手写感 |
| 3 | 思源宋体 Noto Serif SC | 衬线，正式 |
| 4 | 微软雅黑 | 系统默认，零成本 |
| 5 | 等线 DengXian | 瘦、清爽，数字好看 |

切换方式：改 `src/styles/app.css` 的 `--sans`，并在 `src/main.tsx` 引入对应字体 CSS。

---

## 变更记录

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
