// 分发脚本:一键发布 meow-vpet 到 npm
//
// 用法:
//   node scripts/publish.mjs              # 发布当前版本
//   node scripts/publish.mjs patch        # bump patch(0.1.0 → 0.1.1)再发
//   node scripts/publish.mjs minor        # bump minor(0.1.0 → 0.2.0)再发
//   node scripts/publish.mjs major        # bump major(0.1.0 → 1.0.0)再发
//   node scripts/publish.mjs --dry-run    # 模拟发布(只跑 npm pack 看包内容)
//
// 流程:
//   1. 检查 git working tree 是否干净(避免发布未提交的代码)
//   2. 检查 npm 登录状态(必须已登录)
//   3. (可选)npm version <bump> 自动改版本号 + git tag
//   4. npm publish(prepublishOnly 钩子会自动跑 typecheck + build)
//   5. 提示 push git tag

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const isWin = process.platform === 'win32'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bump = args.find((a) => ['patch', 'minor', 'major'].includes(a))

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`)
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    ...opts,
  })
  if (r.status !== 0) {
    console.error(`\n[publish] FAILED: ${cmd} ${cmdArgs.join(' ')} (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
  return r
}

function gitStatus() {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: root, shell: isWin })
  return r.stdout?.toString().trim() ?? ''
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  meow-vpet @ ${pkg.version}${bump ? ` → (${bump} bump)` : ''}${dryRun ? ' [DRY RUN]' : ''}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// 1. git 状态检查
console.log('\n[1/4] git working tree check')
const dirty = gitStatus()
if (dirty) {
  console.error('  FAIL: working tree is dirty. Commit or stash changes first:')
  console.error(dirty)
  process.exit(1)
}
console.log('  OK: working tree clean')

// 2. npm 登录检查
console.log('\n[2/4] npm login check')
const who = spawnSync('npm', ['whoami'], { cwd: root, shell: isWin })
const whoami = who.stdout?.toString().trim() ?? ''
if (who.status !== 0 || !whoami) {
  console.error('  FAIL: not logged in to npm. Run: npm login')
  process.exit(1)
}
console.log(`  OK: logged in as ${whoami}`)
if (whoami !== pkg.author) {
  console.warn(`  WARN: package author="${pkg.author}", you="${whoami}" — publishing under different account`)
}

// 3. 版本号 bump(可选)
if (bump) {
  console.log(`\n[3/4] npm version ${bump}`)
  run('npm', ['version', bump, '--no-git-tag-version'])
  // 重新读 pkg 拿新版本号
  const newPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  console.log(`  version bumped: ${pkg.version} → ${newPkg.version}`)
  // git commit + tag
  run('git', ['add', 'package.json'])
  const commitMsg = `chore: release v${newPkg.version}`
  run('git', ['commit', '-m', isWin ? `"${commitMsg}"` : commitMsg])
  run('git', ['tag', `v${newPkg.version}`])
} else {
  console.log('\n[3/4] (skip version bump)')
}

// 4. 发布
console.log('\n[4/4] publish')
if (dryRun) {
  console.log('  [DRY RUN] npm pack (preview package contents)')
  run('npm', ['pack', '--dry-run'])
  console.log('\n[publish] dry run complete. Remove --dry-run to actually publish.')
} else {
  // prepublishOnly 钩子会自动跑 typecheck + build + artifacts check
  run('npm', ['publish'])
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const finalPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  console.log(`  ✓ published meow-vpet@${finalPkg.version}`)
  console.log(`  → https://www.npmjs.com/package/meow-vpet`)
  console.log(`  → push tag: git push && git push --tags`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}
