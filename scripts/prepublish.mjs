// npm publish 前自动执行的安全闸门
//
// 做的事:
//   1. 跑 typecheck(tsc --noEmit + vue-tsc)确保类型正确
//   2. 跑 build(copy-resources + electron-vite build)确保产物完整
//   3. 检查是否已登录 npm(通过 npm whoami)
//   4. 提示当前发布的版本号
//
// 任何一步失败都会非零退出,npm publish 会因此中止

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const isWin = process.platform === 'win32'

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts })
  if (r.status !== 0) {
    console.error(`\n[prepublish] FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  meow-vpet @ ${pkg.version} — prepublish checks`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// 1. typecheck
console.log('\n[1/4] typecheck (node + web)')
run('npm', ['run', 'typecheck'])

// 2. build (copy-resources + electron-vite build)
console.log('\n[2/4] build (copy-resources + electron-vite build)')
run('npm', ['run', 'build'])

// 3. 产物校验:确认 out/main/index.js 和 resources/models 存在
console.log('\n[3/4] build artifacts check')
const root = resolve(__dirname, '..')
const mainOut = resolve(root, 'out/main/index.js')
const resourcesModels = resolve(root, 'resources/models')
const resourcesLib = resolve(root, 'resources/lib')

const missing = []
if (!existsSync(mainOut)) missing.push('out/main/index.js')
if (!existsSync(resourcesModels)) missing.push('resources/models')
if (!existsSync(resourcesLib)) missing.push('resources/lib')

if (missing.length > 0) {
  console.error(`\n[prepublish] FAILED: build artifacts missing: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('  OK: out/main/index.js, resources/models, resources/lib all present')

// 4. npm whoami
console.log('\n[4/4] npm login status')
const who = spawnSync('npm', ['whoami'], { shell: isWin })
const whoami = who.stdout?.toString().trim() ?? ''
if (who.status !== 0 || !whoami) {
  console.error('\n[prepublish] FAILED: not logged in to npm. Run: npm login')
  process.exit(1)
}
console.log(`  logged in as: ${whoami}`)
if (whoami !== pkg.author) {
  console.warn(`  WARNING: package author is "${pkg.author}" but you are logged in as "${whoami}"`)
  console.warn('  publishing under different account — make sure this is intended')
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  ✓ all checks passed, ready to publish meow-vpet@${pkg.version}`)
console.log(`  → next step: npm publish (or node scripts/publish.mjs patch)`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
