/**
 * 精简打包：只带中英文语言包，去掉 dxcompiler，
 * 再让 electron-builder 用这个目录做 NSIS（跳过它自己的解压步骤）。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')
const staging = path.join(root, 'build-slim', 'win-unpacked')
const appDir = path.join(staging, 'resources', 'app')

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

console.log('· 清理 staging')
rmSync(path.join(root, 'build-slim'), { recursive: true, force: true })
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
execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron-builder', '--win', 'nsis', '--prepackaged', path.join('build-slim', 'win-unpacked')],
  { stdio: 'inherit', cwd: root }
)

console.log('\n完成：release-slim/')
