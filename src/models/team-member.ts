import { BaseModel } from 'esix'
import { z } from 'zod'

import { timestampToDateTime } from '../lib/time'

export const addTeamMemberSchema = z.object({
  userId: z.string().min(1, 'userId is required.')
})

export interface TeamMemberDto {
  createdAt: string
  id: string
  teamId: string
  userId: string
}

export class TeamMember extends BaseModel {
  public teamId = ''
  public userId = ''
}

export function toTeamMemberDto(member: TeamMember): TeamMemberDto {
  return {
    createdAt: timestampToDateTime(member.createdAt),
    id: member.id,
    teamId: member.teamId,
    userId: member.userId
  }
}
