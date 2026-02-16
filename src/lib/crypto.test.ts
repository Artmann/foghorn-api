import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './crypto'

describe('hashPassword', () => {
  it('returns hash and salt', async () => {
    const result = await hashPassword('mypassword')

    expect(result).toEqual({
      hash: expect.any(String),
      salt: expect.any(String)
    })
  })

  it('same password produces different salts', async () => {
    const result1 = await hashPassword('mypassword')
    const result2 = await hashPassword('mypassword')

    expect(result1.salt).not.toEqual(result2.salt)
  })

  it('same password with different salts produces different hashes', async () => {
    const result1 = await hashPassword('mypassword')
    const result2 = await hashPassword('mypassword')

    expect(result1.hash).not.toEqual(result2.hash)
  })
})

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const { hash, salt } = await hashPassword('mypassword')
    const isValid = await verifyPassword('mypassword', hash, salt)

    expect(isValid).toEqual(true)
  })

  it('returns false for wrong password', async () => {
    const { hash, salt } = await hashPassword('mypassword')
    const isValid = await verifyPassword('wrongpassword', hash, salt)

    expect(isValid).toEqual(false)
  })
})
