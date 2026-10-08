import { Schema, SchemaGetter } from 'effect'
import { HttpApiSchema } from 'effect/http-api'

// Every error response has the shape `{ error: { code, message } }`. Errors are
// tagged errors inside the app, and `asApiError` changes how they are encoded
// on the wire.

interface ErrorClass<Tag extends string> extends Schema.Top {
  readonly DecodingServices: never
  readonly Encoded: { readonly _tag: Tag; readonly message: string }
  readonly EncodingServices: never
  readonly Type: { readonly _tag: Tag; readonly message: string }
}

function errorBody<Code extends string>(code: Code) {
  return Schema.Struct({
    error: Schema.Struct({
      code: Schema.Literal(code),
      message: Schema.String
    })
  })
}

export function asApiError<Tag extends string, Code extends string>(
  errorClass: ErrorClass<Tag>,
  { code, status, tag }: { code: Code; status: number; tag: Tag }
) {
  return errorClass.pipe(
    Schema.encodeTo(errorBody(code), {
      decode: SchemaGetter.transform((body) => ({
        _tag: tag,
        message: body.error.message
      })),
      encode: SchemaGetter.transform((error) => ({
        error: { code, message: error.message }
      }))
    }),
    HttpApiSchema.status(status)
  )
}

// Authentication.

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { message: Schema.String }
) {}

export const UnauthorizedResponse = asApiError(Unauthorized, {
  code: 'Unauthorized',
  status: 401,
  tag: 'Unauthorized'
})

export class EmailAlreadyRegistered extends Schema.TaggedError<EmailAlreadyRegistered>()(
  'EmailAlreadyRegistered',
  { message: Schema.String }
) {}

export const EmailAlreadyRegisteredResponse = asApiError(
  EmailAlreadyRegistered,
  { code: 'EmailAlreadyRegistered', status: 409, tag: 'EmailAlreadyRegistered' }
)

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  'InvalidCredentials',
  { message: Schema.String }
) {}

export const InvalidCredentialsResponse = asApiError(InvalidCredentials, {
  code: 'InvalidCredentials',
  status: 401,
  tag: 'InvalidCredentials'
})

// API keys.

export class ApiKeyNotFound extends Schema.TaggedError<ApiKeyNotFound>()(
  'ApiKeyNotFound',
  { message: Schema.String }
) {}

export const ApiKeyNotFoundResponse = asApiError(ApiKeyNotFound, {
  code: 'ApiKeyNotFound',
  status: 404,
  tag: 'ApiKeyNotFound'
})

// Teams.

export class TeamNotFound extends Schema.TaggedError<TeamNotFound>()(
  'TeamNotFound',
  { message: Schema.String }
) {}

export const TeamNotFoundResponse = asApiError(TeamNotFound, {
  code: 'TeamNotFound',
  status: 404,
  tag: 'TeamNotFound'
})

export class NotTeamMember extends Schema.TaggedError<NotTeamMember>()(
  'NotTeamMember',
  { message: Schema.String }
) {}

export const NotTeamMemberResponse = asApiError(NotTeamMember, {
  code: 'NotTeamMember',
  status: 403,
  tag: 'NotTeamMember'
})

export class TeamLimitReached extends Schema.TaggedError<TeamLimitReached>()(
  'TeamLimitReached',
  { message: Schema.String }
) {}

export const TeamLimitReachedResponse = asApiError(TeamLimitReached, {
  code: 'TeamLimitReached',
  status: 409,
  tag: 'TeamLimitReached'
})

export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  'UserNotFound',
  { message: Schema.String }
) {}

export const UserNotFoundResponse = asApiError(UserNotFound, {
  code: 'UserNotFound',
  status: 404,
  tag: 'UserNotFound'
})

export class AlreadyTeamMember extends Schema.TaggedError<AlreadyTeamMember>()(
  'AlreadyTeamMember',
  { message: Schema.String }
) {}

export const AlreadyTeamMemberResponse = asApiError(AlreadyTeamMember, {
  code: 'AlreadyTeamMember',
  status: 409,
  tag: 'AlreadyTeamMember'
})

export class TeamMemberNotFound extends Schema.TaggedError<TeamMemberNotFound>()(
  'TeamMemberNotFound',
  { message: Schema.String }
) {}

export const TeamMemberNotFoundResponse = asApiError(TeamMemberNotFound, {
  code: 'TeamMemberNotFound',
  status: 404,
  tag: 'TeamMemberNotFound'
})

// Sites and pages.

export class SiteNotFound extends Schema.TaggedError<SiteNotFound>()(
  'SiteNotFound',
  { message: Schema.String }
) {}

export const SiteNotFoundResponse = asApiError(SiteNotFound, {
  code: 'SiteNotFound',
  status: 404,
  tag: 'SiteNotFound'
})

export class SiteLimitReached extends Schema.TaggedError<SiteLimitReached>()(
  'SiteLimitReached',
  { message: Schema.String }
) {}

export const SiteLimitReachedResponse = asApiError(SiteLimitReached, {
  code: 'SiteLimitReached',
  status: 409,
  tag: 'SiteLimitReached'
})

export class PageNotFound extends Schema.TaggedError<PageNotFound>()(
  'PageNotFound',
  { message: Schema.String }
) {}

export const PageNotFoundResponse = asApiError(PageNotFound, {
  code: 'PageNotFound',
  status: 404,
  tag: 'PageNotFound'
})
