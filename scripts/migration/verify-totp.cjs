// Read ciphertext only from stdin; never print ciphertext, keys or plaintext.
const { createHash, createDecipheriv } = require('node:crypto')
const { createInterface } = require('node:readline')
const material = process.env.TOTP_ENCRYPTION_KEY || process.env.AUTH_SECRET
if (!material) { console.error('Original TOTP encryption key must be supplied separately.'); process.exit(1) }
const key = createHash('sha256').update(material).digest()
;(async () => {
  for await (const line of createInterface({ input: process.stdin })) {
    const row = JSON.parse(line)
    for (const value of [row.secretCiphertext, row.recoveryCodesCiphertext].filter(Boolean)) {
      const [iv, tag, encrypted] = value.split('.').map(v => Buffer.from(v, 'base64url'))
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      decipher.update(encrypted); decipher.final()
    }
  }
})().catch(() => { console.error('Destination TOTP key cannot decrypt restored account credentials.'); process.exitCode = 1 })
