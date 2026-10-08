import { BaseModel } from 'esix'

import type { TeamDto } from '../api/schemas'
import { timestampToDateTime } from '../lib/time'

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
