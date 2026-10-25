import { isIP } from 'node:net'

const normalize = address => {
  if (typeof address !== 'string') return null
  const value = address.trim()
  if (!isIP(value)) return null
  if (value.toLowerCase().startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7)
  try { return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname : value } catch { return null }
}

export function clientAddress(req, tunnelProvider = 'none') {
  const peer = req.socket.remoteAddress || ''
  // The sharing entrypoints bind ONLY to loopback. Never trust proxy headers
  // merely because static files are enabled, or on non-loopback connections.
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1'
  if (loopback && tunnelProvider === 'ngrok') {
    // ngrok appends the actual connecting IP to any client-supplied XFF list.
    // https://ngrok.com/docs/gateway/endpoints/http#upstream-headers
    const last = (req.get('x-forwarded-for') || '').split(',').at(-1)
    const address = normalize(last)
    if (address) return address
  }
  if (loopback && tunnelProvider === 'cloudflare') {
    const address = normalize(req.get('cf-connecting-ip'))
    if (address) return address
  }
  return normalize(peer) || 'unknown-peer'
}
