import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { CloudflareBindings, AppVariables } from '../types/env'
import { createMongoClient } from '../lib/mongodb'
import { hashPassword, verifyPassword } from '../lib/crypto'
import type { User } from '../models/user'
import { toUserResponse } from '../models/user'

const auth = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const JWT_EXPIRY_SECONDS = 86400 // 24 hours

auth.post('/signup', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()

  const email = body.email?.toLowerCase().trim()
  const password = body.password

  if (!email || !EMAIL_REGEX.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return c.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400
    )
  }

  const db = createMongoClient(c.env)

  const existingUser = await db.findOne<User>('users', { email })
  if (existingUser) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const { hash: passwordHash, salt: passwordSalt } = await hashPassword(password)
  const now = new Date().toISOString()

  const userId = await db.insertOne('users', {
    email,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now
  })

  const user: User = {
    _id: userId,
    email,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now
  }

  return c.json(toUserResponse(user), 201)
})

auth.post('/signin', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()

  const email = body.email?.toLowerCase().trim()
  const password = body.password

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  const db = createMongoClient(c.env)

  const user = await db.findOne<User>('users', { email })
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt)
  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: user._id,
    email: user.email,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS
  }

  const token = await sign(payload, c.env.JWT_SECRET, 'HS256')

  return c.json({
    token,
    expiresIn: JWT_EXPIRY_SECONDS,
    user: {
      id: user._id,
      email: user.email
    }
  })
})

export default auth
