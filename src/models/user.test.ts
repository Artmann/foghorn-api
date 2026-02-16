import { describe, expect, it } from 'vitest'

import { toUserDto, User } from './user'

describe('toUserDto', () => {
  it('returns id, email, and createdAt as ISO string', () => {
    const user = new User()
    user.id = 'abc123'
    user.email = 'test@example.com'
    user.createdAt = 1705320600000

    expect(toUserDto(user)).toEqual({
      createdAt: '2024-01-15T12:10:00.000Z',
      email: 'test@example.com',
      id: 'abc123'
    })
  })

  it('does not include passwordHash or passwordSalt', () => {
    const user = new User()
    user.id = 'abc123'
    user.email = 'test@example.com'
    user.createdAt = 1705320600000
    user.passwordHash = 'secret-hash'
    user.passwordSalt = 'secret-salt'

    const result = toUserDto(user)

    expect(result).not.toHaveProperty('passwordHash')
    expect(result).not.toHaveProperty('passwordSalt')
  })
})
