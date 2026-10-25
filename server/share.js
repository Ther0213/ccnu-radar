import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './index.js'

let publicOrigin = null
let connected = false
const statePath = fileURLToPath(new URL('./.share-state.json', import.meta.url))
const app = createApp({
  staticDirectory: fileURLToPath(new URL('../dist/', import.meta.url)),
  tunnelProvider: 'cloudflare',
  getAllowedOrigins: () => publicOrigin ? [publicOrigin] : [],
})
const server = app.listen(3002, '127.0.0.1', () => {
  console.log('Share server listening at 127.0.0.1:3002')
  const tunnel = spawn(process.env.CLOUDFLARED_PATH || 'cloudflared', ['--no-autoupdate', 'tunnel', '--protocol', process.env.CLOUDFLARED_PROTOCOL || 'http2', '--url', 'http://127.0.0.1:3002'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const saveState = status => writeFileSync(statePath, JSON.stringify({ status, url: publicOrigin, pid: process.pid, tunnelPid: tunnel.pid, updatedAt: new Date().toISOString() }))
  const connectionTimeout = setTimeout(() => {
    if (!connected) { console.error('Tunnel connection timed out. The network may block outbound port 7844. Try another network and restart sharing.'); tunnel.kill() }
  }, 60000)
  const onLog = chunk => {
    const message = chunk.toString()
    // A Quick Tunnel creates one random public hostname. Trust only that exact origin.
    const match = message.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/)
    if (match && !publicOrigin) {
      publicOrigin = match[0]
      saveState('connecting')
    }
    process.stdout.write(message)
    if (!connected && publicOrigin && message.includes('Registered tunnel connection')) {
      connected = true
      clearTimeout(connectionTimeout)
      saveState('connected')
      console.log(`SHARE_URL=${publicOrigin}`)
    }
  }
  tunnel.stdout.on('data', onLog)
  tunnel.stderr.on('data', onLog)
  tunnel.on('error', () => { clearTimeout(connectionTimeout); saveState('stopped'); console.error('Unable to start cloudflared. Check CLOUDFLARED_PATH.'); server.close(); process.exitCode = 1 })
  tunnel.on('exit', code => { clearTimeout(connectionTimeout); saveState('stopped'); console.log(`Tunnel exited (${code}). Share stopped.`); server.close(); process.exitCode = code || 0 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { saveState('stopped'); tunnel.kill(); server.close() })
})
server.on('error', () => { console.error('Unable to start share server on port 3002.'); process.exitCode = 1 })
