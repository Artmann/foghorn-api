import { Hono } from 'hono'
import { sign } from 'hono/jwt'

import { ApiError } from '../lib/api-error'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { jsonValidator } from '../lib/validation'
import { signinSchema, signupSchema, toUserDto, User } from '../models/user'
import type { AppVariables, CloudflareBindings } from '../types/env'

const jwtExpirySeconds = 86400 // 24 hours.

const auth = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

auth.post('/sign-up', jsonValidator(signupSchema), async (context) => {
  const { email, password } = context.req.valid('json')

  const logger = context.get('logger')
  const existingUser = await User.findBy('email', email)

  if (existingUser) {
    logger.warn('Sign-up email conflict', { email })
    throw new ApiError('Email already registered.', 409)
  }

  const { hash: passwordHash, salt: passwordSalt } =
    await hashPassword(password)
  const user = await User.create({ email, passwordHash, passwordSalt })

  logger.info('User signed up', { email })

  return context.json({ user: toUserDto(user) }, 201)
})

auth.post('/sign-in', jsonValidator(signinSchema), async (context) => {
  const { email, password } = context.req.valid('json')
  const logger = context.get('logger')

  const user = await User.findBy('email', email)

  if (!user) {
    logger.warn('Sign-in invalid credentials', { email })
    throw new ApiError('Invalid credentials.', 401)
  }

  const isValid = await verifyPassword(
    password,
    user.passwordHash,
    user.passwordSalt
  )

  if (!isValid) {
    logger.warn('Sign-in invalid credentials', { email })
    throw new ApiError('Invalid credentials.', 401)
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: user.id,
    email: user.email,
    iat: now,
    exp: now + jwtExpirySeconds
  }

  const token = await sign(payload, context.env.JWT_SECRET, 'HS256')

  logger.info('User signed in', { email, userId: user.id })

  return context.json({
    expiresIn: jwtExpirySeconds,
    token,
    user: toUserDto(user)
  })
})

export default auth
