// HS256 JSON Web Tokens with the Web Crypto API, so it works on Workers and
// Bun without extra dependencies.

export interface JwtPayload {
  [claim: string]: unknown
  email?: string
  exp?: number
  iat?: number
  sub?: string
}

export type JwtVerifyResult =
  | { payload: JwtPayload; valid: true }
  | { reason: 'expired' | 'invalid'; valid: false }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function importKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    [usage]
  )
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function signJwt(
  payload: JwtPayload,
  secret: string
): Promise<string> {
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  )
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${header}.${body}`
  const key = await importKey(secret, 'sign')
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signingInput)
  )

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

export async function verifyJwt(
  token: string,
  secret: string,
  nowSeconds: number
): Promise<JwtVerifyResult> {
  const parts = token.split('.')

  if (parts.length !== 3) {
    return { reason: 'invalid', valid: false }
  }

  const [header, body, signature] = parts
  let signatureBytes: Uint8Array
  let headerBytes: Uint8Array
  let bodyBytes: Uint8Array

  try {
    signatureBytes = base64UrlDecode(signature)
    headerBytes = base64UrlDecode(header)
    bodyBytes = base64UrlDecode(body)
  } catch {
    return { reason: 'invalid', valid: false }
  }

  const parsedHeader = parseJson(headerBytes)

  if (!isObject(parsedHeader) || parsedHeader.alg !== 'HS256') {
    return { reason: 'invalid', valid: false }
  }

  // `crypto.subtle.verify` compares in constant time.
  const key = await importKey(secret, 'verify')
  const isValidSignature = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(`${header}.${body}`)
  )

  if (!isValidSignature) {
    return { reason: 'invalid', valid: false }
  }

  const payload = parseJson(bodyBytes)

  if (!isObject(payload)) {
    return { reason: 'invalid', valid: false }
  }

  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
    return { reason: 'expired', valid: false }
  }

  return { payload, valid: true }
}
