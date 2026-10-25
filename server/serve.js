import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './index.js'

// One local process serves the built website and its API on the same origin.
const port = Number(process.env.PORT || 3001)
const directory = fileURLToPath(new URL('../dist/', import.meta.url))
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer from 1 to 65535.')
  process.exit(1)
}
if (!existsSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)))) {
  console.error('Please run npm run build in the project folder before npm start.')
  process.exit(1)
}
if (process.env.NODE_ENV === 'production') {
  console.error('This launcher is for local HTTP demos. For public HTTPS sharing use npm --prefix server run share:ngrok; see README.md.')
  process.exit(1)
}
const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173']
const server = createApp({ staticDirectory: directory, secureCookies: false, getAllowedOrigins: () => origins }).listen(port, '127.0.0.1', () => {
  console.log(`CCNU Radar ready: http://localhost:${port}`)
  console.log('Website and API are running together. Keep this process running; Ctrl+C stops it.')
})
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the old backend before starting this launcher.` : 'Unable to start CCNU Radar.')
  process.exitCode = 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
})
