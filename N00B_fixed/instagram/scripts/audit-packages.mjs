// Package audit for the website: fails on a high / critical problem in the packages the site is built from,
// EXCEPT advisories listed below that have NO fixed version yet and only touch build-time tools.
// Remove an entry as soon as a fixed version exists (the check then goes back to being strict for it).
import { spawnSync } from 'node:child_process'

const WAIVED = {
  // picomatch ReDoS (vite's file matcher, runs on a developer's computer / the build, never for visitors). Affects <= 4.0.7, no patched version published (checked 2026-11-17).
  'GHSA-fc5q-39xc-vjpf': 'picomatch (build tool, no fixed version yet)',
}

const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
let report
try { report = JSON.parse(r.stdout) } catch { console.error('Could not read the npm audit answer:\n' + (r.stdout || r.stderr)); process.exit(1) }

const bad = []
for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(v.severity)) continue
  const direct = (v.via || []).filter((x) => typeof x === 'object')
  // a package that is only flagged because it depends on a flagged package carries no advisory of its own
  if (!direct.length) continue
  const open = direct.filter((x) => !WAIVED[String(x.url || '').split('/').pop()])
  if (open.length) bad.push(`${name}: ${open.map((x) => x.title + ' ' + x.url).join('; ')}`)
}

if (bad.length) {
  console.error('High / critical problems in the website packages:\n - ' + bad.join('\n - '))
  process.exit(1)
}
console.log('Website packages: no unwaived high / critical problems.' + (Object.keys(WAIVED).length ? ' Waived: ' + Object.values(WAIVED).join(', ') + '.' : ''))
