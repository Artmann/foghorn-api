const iterations = 100000
const keyLength = 256
const saltLength = 16

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  return btoa(binary)
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export async function hashPassword(
  password: string
): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(saltLength))
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    key,
    keyLength
  )

  return {
    hash: bufferToBase64(derivedBits),
    salt: bufferToBase64(salt.buffer)
  }
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const salt = base64ToBuffer(storedSalt)
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    key,
    keyLength
  )

  const computedHash = bufferToBase64(derivedBits)

  return timingSafeEqual(computedHash, storedHash)
}

function timingSafeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) {
    return false
  }

  let result = 0

  for (let i = 0; i < first.length; i++) {
    result |= first.charCodeAt(i) ^ second.charCodeAt(i)
  }

  return result === 0
}
