import { BaseModel } from 'esix'
import { z } from 'zod'

import { timestampToDateTime } from '../lib/time'

export const createTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or less.')
})

export const updateTeamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or less.')
})

export interface TeamDto {
  createdAt: string
  id: string
  name: string
}

export class Team extends BaseModel {
  public name = ''
}

export function toTeamDto(team: Team): TeamDto {
  return {
    createdAt: timestampToDateTime(team.createdAt),
    id: team.id,
    name: team.name
  }
}
