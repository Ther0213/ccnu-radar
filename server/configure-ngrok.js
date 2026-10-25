import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// This prompt runs only in the user's terminal. Never echo or log the authtoken.
if (!process.stdin.isTTY) {
  console.error('Open start-share.cmd in a Windows terminal to enter the ngrok authtoken locally.')
  process.exit(1)
}
console.log('Get your authtoken at https://dashboard.ngrok.com/get-started/your-authtoken')
process.stdout.write('Paste your ngrok authtoken, then press Enter (input hidden): ')
process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
let token = ''
process.stdin.on('data', input => {
  for (const char of input) {
    if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(1) }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      console.log('')
      token = token.trim()
      if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) { console.error('Invalid token format. Copy the authtoken only, not the whole command.'); process.exit(1) }
      const result = spawnSync(fileURLToPath(new URL('./tools/ngrok.exe', import.meta.url)), ['config', 'add-authtoken', token, '--config', fileURLToPath(new URL('./.ngrok.local.yml', import.meta.url))], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 })
      token = ''
      if (result.status !== 0) { console.error('Unable to save ngrok configuration. Check the local tool and token.'); process.exit(1) }
      console.log('Authtoken saved locally. It is ignored by Git and is never sent to the website.')
      process.exit(0)
    }
    if (char === '\u007f' || char === '\b') token = token.slice(0, -1)
    else if (char >= ' ' && char <= '~') token += char
    if (token.length > 1024) { process.stdin.setRawMode(false); console.error('\nToken is too long.'); process.exit(1) }
  }
})
