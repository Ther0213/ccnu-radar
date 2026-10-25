import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './index.js'

const localPath = path => fileURLToPath(new URL(path, import.meta.url))
const config = localPath('./.ngrok.local.yml')
const binary = localPath('./tools/ngrok.exe')
if (!existsSync(binary) || !existsSync(config) || !existsSync(localPath('../dist/index.html'))) {
  console.error('Run start-share.cmd first to configure ngrok and build the website.')
  process.exit(1)
}
let publicOrigin = null
const app = createApp({ staticDirectory: localPath('../dist/'), tunnelProvider: 'ngrok', getAllowedOrigins: () => publicOrigin ? [publicOrigin] : [] })
const server = app.listen(3002, '127.0.0.1', () => {
  console.log('Share server ready. Connecting ngrok...')
  const agent = spawn(binary, ['http', 'http://127.0.0.1:3002', '--config', config, '--inspect=false', '--log=stdout', '--log-format=json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const saveState = status => writeFileSync(localPath('./.share-state.json'), JSON.stringify({ provider: 'ngrok', status, url: publicOrigin, pid: process.pid, tunnelPid: agent.pid, updatedAt: new Date().toISOString() }))
  saveState('connecting')
  const timeout = setTimeout(() => { if (!publicOrigin) { console.error('ngrok connection timed out. Check the local token and VPN connectivity.'); agent.kill() } }, 60000)
  let buffer = ''
  let reportedError = false
  const reportError = text => {
    const code = text.match(/ERR_NGROK_\d+/)?.[0]
    if (code && !reportedError) { reportedError = true; console.error(`ngrok error ${code}. Check https://ngrok.com/docs/errors/${code.toLowerCase()} (do not share your token).`) }
  }
  agent.stdout.on('data', chunk => {
    buffer += chunk.toString()
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
      try {
        const entry = JSON.parse(line)
        reportError(line)
        if (entry.msg === 'started tunnel' && entry.url && !publicOrigin) {
          const url = new URL(entry.url)
          if (url.protocol !== 'https:') continue
          publicOrigin = url.origin
          clearTimeout(timeout); saveState('connected')
          console.log(`SHARE_URL=${publicOrigin}`)
          console.log('Keep this window open. Press Ctrl+C to stop sharing.')
        }
      } catch { reportError(line) }
    }
    if (buffer.length > 65536) buffer = ''
  })
  // Never echo raw agent error text: it can include configuration or token fragments.
  agent.stderr.on('data', chunk => reportError(chunk.toString()))
  agent.on('error', () => { clearTimeout(timeout); saveState('stopped'); console.error('Unable to start ngrok.exe.'); server.close(); process.exitCode = 1 })
  agent.on('exit', code => { clearTimeout(timeout); saveState('stopped'); console.log(`Sharing stopped (exit ${code}).`); server.close(); process.exitCode = code || 0 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { saveState('stopped'); agent.kill(); server.close() })
})
server.on('error', () => { console.error('Port 3002 is occupied. Stop the previous sharing window and try again.'); process.exitCode = 1 })
