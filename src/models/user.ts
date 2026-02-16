import { BaseModel } from 'esix'
import { z } from 'zod'

import { timestampToDateTime } from '../lib/time'

export const signupSchema = z.object({
  email: z
    .string()
    .email('Invalid email format.')
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters.')
})

export const signinSchema = z.object({
  email: z
    .string()
    .min(1, 'Email and password are required.')
    .transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1, 'Email and password are required.')
})

export interface UserDto {
  createdAt: string
  email: string
  id: string
}

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
