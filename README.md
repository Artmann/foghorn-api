# Foghorn API

API for running and collecting Lighthouse data for your site.

## Authentication

The API supports two authentication methods via Bearer token:

1. **JWT tokens** - Returned from `/auth/sign-in`, expires in 24 hours
2. **API keys** - Created via `/api-keys`, prefixed with `fh_`

```bash
# Using JWT
curl -H "Authorization: Bearer <jwt-token>" https://api.example.com/sites

# Using API key
curl -H "Authorization: Bearer fh_abc123..." https://api.example.com/sites
```

## Endpoints

### Auth

#### Create an account

```
POST /auth/sign-up
```

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### Sign in

```
POST /auth/sign-in
```

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Returns a JWT token and its expiry.

### API Keys

All API key endpoints require authentication.

#### Create an API key

```
POST /api-keys
```

```json
{
  "name": "My Key",
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

`expiresAt` is optional. The full key value is only returned once on creation.

#### List API keys

```
GET /api-keys
```

#### Delete an API key

```
DELETE /api-keys/:id
```

### Teams

All team endpoints require authentication.

#### Create a team

```
POST /teams
```

```json
{
  "name": "My Team"
}
```

The creator is automatically added as a member.

#### List your teams

```
GET /teams
```

#### Get a team

```
GET /teams/:id
```

#### Update a team

```
PUT /teams/:id
```

```json
{
  "name": "New Name"
}
```

#### Delete a team

```
DELETE /teams/:id
```

#### Add a member

```
POST /teams/:id/members
```

```json
{
  "userId": "user-id-here"
}
```

#### List members

```
GET /teams/:id/members
```

#### Remove a member

```
DELETE /teams/:id/members/:userId
```

### Sites

All site endpoints require authentication. You must be a member of the site's
team.

#### Create a site

```
POST /sites
```

```json
{
  "teamId": "team-id-here",
  "domain": "www.example.com",
  "sitemapPath": "/sitemap.xml"
}
```

`sitemapPath` is optional and defaults to `/sitemap.xml`.

#### List sites for a team

```
GET /sites?teamId=team-id-here
```

#### Get a site

```
GET /sites/:id
```

#### Update a site

```
PUT /sites/:id
```

```json
{
  "domain": "new-domain.com",
  "sitemapPath": "/custom-sitemap.xml"
}
```

Both fields are optional.

#### Delete a site

```
DELETE /sites/:id
```

### Pages

All page endpoints require authentication. You must be a member of the page's
site's team.

#### List pages

```
GET /pages?siteId=site-id-here&search=keyword
```

Both query parameters are optional. If `siteId` is provided, returns pages for
that site. Otherwise, returns pages across all sites you have access to.
`search` filters pages where the URL or path matches the term
(case-insensitive).

#### Get a page

```
GET /pages/:id
```

### Other

#### Health check

```
GET /
```

#### OpenAPI spec

```
GET /openapi
```
