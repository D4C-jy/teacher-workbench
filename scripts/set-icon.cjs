/**
 * 给 Electron 的 exe 写入图标与版本信息。
 * 因为用 --prepackaged 打包时 electron-builder 会跳过着图标的步骤，这里自己补。
 *
 * 用法：node scripts/set-icon.cjs <exe路径> <ico路径> [产品名]
 */
const fs = require('node:fs')
const ResEdit = require('resedit')

const exePath = process.argv[2]
const icoPath = process.argv[3]
const productName = process.argv[4] || '教培工作台'

if (!exePath || !icoPath) {
  console.error('用法：node scripts/set-icon.cjs <exe> <ico> [产品名]')
  process.exit(1)
}

const exeData = fs.readFileSync(exePath)
const exeFile = ResEdit.NtExecutable.from(exeData, { ignoreCert: true })
const res = ResEdit.NtExecutableResource.from(exeFile)

const icoFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath))
const iconDatas = icoFile.icons.map((i) => i.data)

// exe 里可能有多组图标（不同语言），全部替换
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
if (groups.length === 0) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconDatas)
} else {
  for (const g of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconDatas)
  }
}
console.log(`替换了 ${groups.length || 1} 组图标，共 ${iconDatas.length} 个尺寸`)

const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
if (versions.length > 0) {
  const vi = versions[0]
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    { ProductName: productName, FileDescription: productName }
  )
  vi.outputToResourceEntries(res.entries)
}

res.outputResource(exeFile)
fs.writeFileSync(exePath, Buffer.from(exeFile.generate()))
console.log(`图标已写入：${exePath}`)
