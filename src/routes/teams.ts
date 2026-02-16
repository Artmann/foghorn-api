import { Hono } from 'hono'

import { ApiError } from '../lib/api-error'
import { jsonValidator } from '../lib/validation'
import { authMiddleware } from '../middleware/auth'
import {
  Team,
  createTeamSchema,
  toTeamDto,
  updateTeamSchema
} from '../models/team'
import {
  TeamMember,
  addTeamMemberSchema,
  toTeamMemberDto
} from '../models/team-member'
import { User } from '../models/user'
import type { AppVariables, CloudflareBindings } from '../types/env'

const teams = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

teams.use('*', authMiddleware())

async function requireTeamMembership(
  teamId: string,
  userId: string
): Promise<Team> {
  const team = await Team.find(teamId)

  if (!team) {
    throw new ApiError('Team not found.', 404)
  }

  const members = await TeamMember.where('teamId', teamId).get()
  const isMember = members.some((m) => m.userId === userId)

  if (!isMember) {
    throw new ApiError('You are not a member of this team.', 403)
  }

  return team
}

// Create a team.
teams.post('/', jsonValidator(createTeamSchema), async (context) => {
  const { name } = context.req.valid('json')
  const auth = context.get('auth')
  const logger = context.get('logger')

  const team = await Team.create({ name })
  await TeamMember.create({ teamId: team.id, userId: auth.userId })

  logger.info('Team created', { teamId: team.id, userId: auth.userId })

  return context.json({ team: toTeamDto(team) }, 201)
})

// List teams the authenticated user belongs to.
teams.get('/', async (context) => {
  const auth = context.get('auth')

  const memberships = await TeamMember.where('userId', auth.userId).get()
  const teamIds = memberships.map((m) => m.teamId)

  const teamList: Team[] = []
  for (const teamId of teamIds) {
    const team = await Team.find(teamId)
    if (team) {
      teamList.push(team)
    }
  }

  return context.json({ teams: teamList.map(toTeamDto) })
})

// Get a single team.
teams.get('/:id', async (context) => {
  const auth = context.get('auth')
  const teamId = context.req.param('id')

  const team = await requireTeamMembership(teamId, auth.userId)

  return context.json({ team: toTeamDto(team) })
})

// Update team name.
teams.put('/:id', jsonValidator(updateTeamSchema), async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const teamId = context.req.param('id')
  const { name } = context.req.valid('json')

  const team = await requireTeamMembership(teamId, auth.userId)

  team.name = name
  await team.save()

  logger.info('Team updated', { teamId: team.id, userId: auth.userId })

  return context.json({ team: toTeamDto(team) })
})

// Delete team and all its memberships.
teams.delete('/:id', async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const teamId = context.req.param('id')

  const team = await requireTeamMembership(teamId, auth.userId)

  const members = await TeamMember.where('teamId', teamId).get()
  for (const member of members) {
    await member.delete()
  }

  await team.delete()

  logger.info('Team deleted', { teamId: team.id, userId: auth.userId })

  return context.json({ success: true })
})

// Add a member to a team.
teams.post(
  '/:id/members',
  jsonValidator(addTeamMemberSchema),
  async (context) => {
    const auth = context.get('auth')
    const logger = context.get('logger')
    const teamId = context.req.param('id')
    const { userId } = context.req.valid('json')

    await requireTeamMembership(teamId, auth.userId)

    const user = await User.find(userId)
    if (!user) {
      throw new ApiError('User not found.', 404)
    }

    const existingMembers = await TeamMember.where('teamId', teamId).get()
    const alreadyMember = existingMembers.some((m) => m.userId === userId)

    if (alreadyMember) {
      throw new ApiError('User is already a member of this team.', 409)
    }

    const member = await TeamMember.create({ teamId, userId })

    logger.info('Team member added', { teamId, userId, addedBy: auth.userId })

    return context.json({ member: toTeamMemberDto(member) }, 201)
  }
)

// List members of a team.
teams.get('/:id/members', async (context) => {
  const auth = context.get('auth')
  const teamId = context.req.param('id')

  await requireTeamMembership(teamId, auth.userId)

  const members = await TeamMember.where('teamId', teamId).get()

  return context.json({ members: members.map(toTeamMemberDto) })
})

// Remove a member from a team.
teams.delete('/:id/members/:userId', async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const teamId = context.req.param('id')
  const userId = context.req.param('userId')

  await requireTeamMembership(teamId, auth.userId)

  const members = await TeamMember.where('teamId', teamId).get()
  const member = members.find((m) => m.userId === userId)

  if (!member) {
    throw new ApiError('Member not found.', 404)
  }

  await member.delete()

  logger.info('Team member removed', { teamId, userId, removedBy: auth.userId })

  return context.json({ success: true })
})

export default teams
