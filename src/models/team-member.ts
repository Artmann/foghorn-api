import { BaseModel } from 'esix'

import type { TeamMemberDto } from '../api/schemas'
import { timestampToDateTime } from '../lib/time'

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
