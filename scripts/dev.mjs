import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = resolve(root, 'backend')
const python = resolve(root, '.tools', 'python', 'python.exe')

if (!existsSync(python)) {
  console.error('Patternly’s private Python runtime is missing. See the setup section in README.md.')
  process.exit(1)
}

const services = [
  spawn(python, ['-m', 'uvicorn', 'main:app', '--app-dir', '.', '--reload'], {
    cwd: backend,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(process.execPath, [resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  }),
]

let shuttingDown = false
function stop(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const service of services) if (!service.killed) service.kill()
  process.exitCode = code
}

for (const service of services) {
  service.on('error', error => {
    console.error(`Could not start a Patternly service: ${error.message}`)
    stop(1)
  })
  service.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`A Patternly service stopped${signal ? ` (${signal})` : ` with code ${code}`}.`)
      stop(code ?? 1)
    }
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
