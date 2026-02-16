const keyPrefix = 'fh_'
const keyLength = 32

function bufferToBase64Url(buffer: Uint8Array): string {
  let binary = ''

  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i])
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = new Uint8Array(hashBuffer)

  return Array.from(hashArray)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function generateApiKey(): Promise<{
  hash: string
  key: string
  prefix: string
}> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(keyLength))
  const keyBody = bufferToBase64Url(randomBytes)
  const fullKey = `${keyPrefix}${keyBody}`

  const hash = await sha256(fullKey)
  const prefix = fullKey.substring(0, 8)

  return { hash, key: fullKey, prefix }
}

export async function hashApiKey(key: string): Promise<string> {
  return sha256(key)
}

export function isApiKey(token: string): boolean {
  return token.startsWith(keyPrefix)
}
