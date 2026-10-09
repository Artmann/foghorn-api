import { Clock, Effect, Option } from 'effect'

import { CurrentUser } from '../api/authentication'
import { toTeamDto } from '../models/team'
import { DatabaseError } from '../services/database'
import { Issues } from '../services/issues'
import { JobRunners } from '../services/job-runners'
import { Pages } from '../services/pages'
import { Sites } from '../services/sites'
import { Teams } from '../services/teams'
import { FoghornToolkit, ToolFailed } from './tools'

// The MCP middleware provides `CurrentUser` per request. Tool handlers are
// built once, so they read it with `serviceOption` instead of requiring it.
const currentUserId = Effect.serviceOption(CurrentUser).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () =>
        Effect.fail(
          new ToolFailed({
            message:
              'Not authenticated. Connect with an API key from POST /api-keys as the bearer token.'
          })
        ),
      onSome: (user) => Effect.succeed(user.userId)
    })
  )
)

// Turns domain errors into a `ToolFailed` with the same message, so the agent
// sees what to do next. Database failures are unexpected and become defects,
// which the MCP server reports as an internal error.
function asTool<A, E extends { readonly message: string }, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, ToolFailed, R> {
  return Effect.catch(effect, (error) =>
    error instanceof DatabaseError
      ? Effect.die(error)
      : Effect.fail(new ToolFailed({ message: error.message }))
  )
}

export const FoghornToolkitLive = FoghornToolkit.toLayer(
  Effect.gen(function* () {
    const issues = yield* Issues
    const jobRunners = yield* JobRunners
    const pages = yield* Pages
    const sites = yield* Sites
    const teams = yield* Teams

    return FoghornToolkit.of({
      add_site: (parameters) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const site = yield* sites.create({
              domain: parameters.domain,
              sitemapPath: parameters.sitemapPath,
              teamId: parameters.teamId,
              userId
            })

            return { site }
          })
        ),

      create_team: ({ name }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const team = yield* teams.create({ name, userId })

            return { team: toTeamDto(team) }
          })
        ),

      get_page: ({ pageId }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const page = yield* pages.get({ pageId, userId })

            return { page }
          })
        ),

      get_service_status: () =>
        asTool(
          Effect.gen(function* () {
            yield* currentUserId

            const jobRunner = yield* jobRunners.status(
              yield* Clock.currentTimeMillis
            )

            return { jobRunner, service: 'foghorn-api', status: 'ok' }
          })
        ),

      get_site: ({ siteId }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const site = yield* sites.get({ siteId, userId })

            return { site }
          })
        ),

      list_issues: ({ category, limit, offset, pagesPerIssue, siteId }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId

            return yield* issues.list({
              category,
              limit,
              offset,
              pagesPerIssue,
              siteId,
              userId
            })
          })
        ),

      list_pages: ({ limit, offset, search, siteId }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId

            return yield* pages.list({ limit, offset, search, siteId, userId })
          })
        ),

      list_sites: ({ teamId }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const siteList = yield* sites.list({ teamId, userId })

            return { sites: siteList }
          })
        ),

      list_teams: () =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const teamList = yield* teams.listForUser(userId)

            return { teams: teamList.map(toTeamDto) }
          })
        ),

      update_site: ({ domain, siteId, sitemapPath }) =>
        asTool(
          Effect.gen(function* () {
            const userId = yield* currentUserId
            const site = yield* sites.update({
              domain,
              siteId,
              sitemapPath,
              userId
            })

            return { site }
          })
        )
    })
  })
)
