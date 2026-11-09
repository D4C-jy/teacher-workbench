/**
 * 精简打包：只带中英文语言包，去掉 dxcompiler，
 * 再让 electron-builder 用这个目录做 NSIS（跳过它自己的解压步骤）。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')
let stagingRoot = path.join(root, 'build-slim')

const REQUIRED = [
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll',
  'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'snapshot_blob.bin',
  'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json',
  'vulkan-1.dll', 'electron_wer.dll', 'version', 'LICENSE', 'LICENSES.chromium.html',
]

if (!existsSync(electronDist)) {
  console.error('缺少 electron/dist，先运行：node node_modules/electron/install.js')
  process.exit(1)
}
if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('缺少 dist/，先运行：npm run build:all')
  process.exit(1)
}

// 有些环境（沙箱/杀软）不允许删目录，删不掉就换一个新目录
console.log('· 准备 staging')
try {
  rmSync(stagingRoot, { recursive: true, force: true })
} catch {
  stagingRoot = path.join(root, `build-slim-${Date.now()}`)
  console.log('  旧目录占用，改用', path.basename(stagingRoot))
}
const staging = path.join(stagingRoot, 'win-unpacked')
const appDir = path.join(staging, 'resources', 'app')
mkdirSync(path.join(staging, 'locales'), { recursive: true })
mkdirSync(appDir, { recursive: true })

console.log('· 复制运行时（仅中英文语言包）')
cpSync(path.join(electronDist, 'electron.exe'), path.join(staging, '教培工作台.exe'))
for (const f of REQUIRED) {
  const src = path.join(electronDist, f)
  if (existsSync(src)) cpSync(src, path.join(staging, f))
}
for (const lang of ['zh-CN.pak', 'en-US.pak']) {
  cpSync(path.join(electronDist, 'locales', lang), path.join(staging, 'locales', lang))
}

console.log('· 复制应用')
for (const item of ['dist', 'dist-server', 'electron', 'package.json']) {
  cpSync(path.join(root, item), path.join(appDir, item), { recursive: true })
}

console.log('· 调用 electron-builder')
const rel = path.relative(root, staging).replace(/\\/g, '/')
execSync(`npx electron-builder --win nsis --prepackaged "${rel}"`, { stdio: 'inherit', cwd: root })

console.log('\n完成：release-slim/')
