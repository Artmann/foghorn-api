import { BaseModel } from 'esix'

import type { UserDto } from '../api/schemas'
import { timestampToDateTime } from '../lib/time'

export class User extends BaseModel {
  public email = ''
  public passwordHash = ''
  public passwordSalt = ''
}

export function toUserDto(user: User): UserDto {
  return {
    createdAt: timestampToDateTime(user.createdAt),
    email: user.email,
    id: user.id
  }
}
