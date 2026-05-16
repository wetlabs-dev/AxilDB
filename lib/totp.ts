import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const issuer = 'AxilDB'
const digits = 6
const periodSeconds = 30

export function generateTotpSecret() {
  return base32Encode(randomBytes(20))
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase()
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
  })
}

export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashRecoveryCode(code: string) {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

export function totpProvisioningUri(email: string, secret: string) {
  const label = `${issuer}:${email}`
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(periodSeconds),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

export function verifyTotp(secret: string, code: string, window = 1) {
  const normalized = code.replace(/\D/g, '')
  if (normalized.length !== digits) return false

  const currentCounter = Math.floor(Date.now() / 1000 / periodSeconds)
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeCodeEqual(hotp(secret, currentCounter + offset), normalized)) return true
  }
  return false
}

export function encryptTotpSecret(secret: string) {
  return encryptText(secret)
}

export function decryptTotpSecret(ciphertext: string) {
  return decryptText(ciphertext)
}

export function encryptRecoveryCodes(codes: string[]) {
  return encryptText(JSON.stringify(codes))
}

export function decryptRecoveryCodes(ciphertext: string | null | undefined) {
  if (!ciphertext) return []
  return JSON.parse(decryptText(ciphertext)) as string[]
}

function encryptText(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

function decryptText(ciphertext: string) {
  const [ivRaw, tagRaw, encryptedRaw] = ciphertext.split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted two-factor payload.')

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

function base32Encode(buffer: Buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')

  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0')
    output += alphabet[parseInt(chunk, 2)]
  }
  return output
}

function base32Decode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const char of clean) {
    const index = alphabet.indexOf(char)
    if (index === -1) throw new Error('Invalid TOTP secret.')
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

function safeCodeEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

function encryptionKey() {
  const material = process.env.TOTP_ENCRYPTION_KEY || process.env.AUTH_SECRET || 'axildb-development-totp-key'
  return createHash('sha256').update(material).digest()
}
