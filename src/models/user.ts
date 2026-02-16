export interface User {
  _id: string
  email: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  email: string
  password: string
}

export interface UserResponse {
  id: string
  email: string
  createdAt: string
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user._id,
    email: user.email,
    createdAt: user.createdAt
  }
}
