import { Context, Effect, Layer } from 'effect'

import {
  AlreadyTeamMember,
  NotTeamMember,
  TeamLimitReached,
  TeamMemberNotFound,
  TeamNotFound,
  UserNotFound
} from '../api/errors'
import { Team } from '../models/team'
import { TeamMember } from '../models/team-member'
import { User } from '../models/user'
import { Database, type DatabaseError } from './database'

export const maxTeamsPerUser = 5

type MembershipError = DatabaseError | NotTeamMember | TeamNotFound

export interface TeamsShape {
  readonly addMember: (input: {
    actorId: string
    teamId: string
    userId: string
  }) => Effect.Effect<
    TeamMember,
    AlreadyTeamMember | MembershipError | UserNotFound
  >
  readonly create: (input: {
    name: string
    userId: string
  }) => Effect.Effect<Team, DatabaseError | TeamLimitReached>
  readonly delete: (input: {
    teamId: string
    userId: string
  }) => Effect.Effect<void, MembershipError>
  readonly listForUser: (userId: string) => Effect.Effect<Team[], DatabaseError>
  readonly listMembers: (input: {
    teamId: string
    userId: string
  }) => Effect.Effect<TeamMember[], MembershipError>
  readonly removeMember: (input: {
    actorId: string
    teamId: string
    userId: string
  }) => Effect.Effect<void, MembershipError | TeamMemberNotFound>
  readonly rename: (input: {
    name: string
    teamId: string
    userId: string
  }) => Effect.Effect<Team, MembershipError>
  // Fails unless the team exists and the user is a member of it.
  readonly requireMembership: (input: {
    teamId: string
    userId: string
  }) => Effect.Effect<Team, MembershipError>
  readonly teamIdsForUser: (
    userId: string
  ) => Effect.Effect<string[], DatabaseError>
}

export class Teams extends Context.Service<Teams, TeamsShape>()(
  'foghorn/services/Teams'
) {
  static readonly layer = Layer.effect(
    Teams,
    Effect.gen(function* () {
      const database = yield* Database

      const membersOf = (teamId: string) =>
        database.use('TeamMember.where', () =>
          TeamMember.where('teamId', teamId).get()
        )

      const teamIdsForUser = Effect.fn('Teams.teamIdsForUser')(function* (
        userId: string
      ) {
        const memberships = yield* database.use('TeamMember.where', () =>
          TeamMember.where('userId', userId).get()
        )

        return memberships.map((membership) => membership.teamId)
      })

      const requireMembership = Effect.fn('Teams.requireMembership')(
        function* (input: { teamId: string; userId: string }) {
          const team = yield* database.use('Team.find', () =>
            Team.find(input.teamId)
          )

          if (!team) {
            return yield* new TeamNotFound({
              message:
                'Team not found. Check the ID against your list of teams.'
            })
          }

          const members = yield* membersOf(input.teamId)
          const isMember = members.some(
            (member) => member.userId === input.userId
          )

          if (!isMember) {
            return yield* new NotTeamMember({
              message:
                'You are not a member of this team. Ask a team member to add you.'
            })
          }

          return team
        }
      )

      const create = Effect.fn('Teams.create')(function* (input: {
        name: string
        userId: string
      }) {
        const teamIds = yield* teamIdsForUser(input.userId)

        if (teamIds.length >= maxTeamsPerUser) {
          return yield* new TeamLimitReached({
            message: `You have reached the maximum of ${maxTeamsPerUser} teams.`
          })
        }

        const team = yield* database.use('Team.create', () =>
          Team.create({ name: input.name })
        )

        yield* database.use('TeamMember.create', () =>
          TeamMember.create({ teamId: team.id, userId: input.userId })
        )

        yield* Effect.logInfo('Team created').pipe(
          Effect.annotateLogs({ teamId: team.id, userId: input.userId })
        )

        return team
      })

      const listForUser = Effect.fn('Teams.listForUser')(function* (
        userId: string
      ) {
        const teamIds = yield* teamIdsForUser(userId)

        if (teamIds.length === 0) {
          return []
        }

        return yield* database.use('Team.whereIn', () =>
          Team.whereIn('id', teamIds).get()
        )
      })

      const rename = Effect.fn('Teams.rename')(function* (input: {
        name: string
        teamId: string
        userId: string
      }) {
        const team = yield* requireMembership(input)

        team.name = input.name
        yield* database.use('Team.save', () => team.save())

        yield* Effect.logInfo('Team updated').pipe(
          Effect.annotateLogs({ teamId: team.id, userId: input.userId })
        )

        return team
      })

      const remove = Effect.fn('Teams.delete')(function* (input: {
        teamId: string
        userId: string
      }) {
        const team = yield* requireMembership(input)

        yield* database.use('TeamMember.delete', () =>
          TeamMember.where('teamId', input.teamId).delete()
        )
        yield* database.use('Team.delete', () => team.delete())

        yield* Effect.logInfo('Team deleted').pipe(
          Effect.annotateLogs({ teamId: team.id, userId: input.userId })
        )
      })

      const addMember = Effect.fn('Teams.addMember')(function* (input: {
        actorId: string
        teamId: string
        userId: string
      }) {
        yield* requireMembership({
          teamId: input.teamId,
          userId: input.actorId
        })

        const user = yield* database.use('User.find', () =>
          User.find(input.userId)
        )

        if (!user) {
          return yield* new UserNotFound({
            message: 'User not found. Check the user ID and try again.'
          })
        }

        const members = yield* membersOf(input.teamId)

        if (members.some((member) => member.userId === input.userId)) {
          return yield* new AlreadyTeamMember({
            message: 'User is already a member of this team.'
          })
        }

        const member = yield* database.use('TeamMember.create', () =>
          TeamMember.create({ teamId: input.teamId, userId: input.userId })
        )

        yield* Effect.logInfo('Team member added').pipe(
          Effect.annotateLogs({
            addedBy: input.actorId,
            teamId: input.teamId,
            userId: input.userId
          })
        )

        return member
      })

      const listMembers = Effect.fn('Teams.listMembers')(function* (input: {
        teamId: string
        userId: string
      }) {
        yield* requireMembership(input)

        return yield* membersOf(input.teamId)
      })

      const removeMember = Effect.fn('Teams.removeMember')(function* (input: {
        actorId: string
        teamId: string
        userId: string
      }) {
        yield* requireMembership({
          teamId: input.teamId,
          userId: input.actorId
        })

        const members = yield* membersOf(input.teamId)
        const member = members.find((item) => item.userId === input.userId)

        if (!member) {
          return yield* new TeamMemberNotFound({
            message:
              "Member not found. Check the user ID against the team's members."
          })
        }

        yield* database.use('TeamMember.delete', () => member.delete())

        yield* Effect.logInfo('Team member removed').pipe(
          Effect.annotateLogs({
            removedBy: input.actorId,
            teamId: input.teamId,
            userId: input.userId
          })
        )
      })

      return Teams.of({
        addMember,
        create,
        delete: remove,
        listForUser,
        listMembers,
        removeMember,
        rename,
        requireMembership,
        teamIdsForUser
      })
    })
  )
}
