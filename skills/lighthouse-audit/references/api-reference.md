# Foghorn API Reference

**Base URL:** `https://foghorn-api.artgaard.workers.dev`

All endpoints return JSON. Errors use a consistent shape:

```json
{
  "error": {
    "message": "Description of what went wrong"
  }
}
```

Common status codes: `200` OK, `201` Created, `400` Validation error, `401` Unauthorized, `403` Forbidden, `404` Not found, `409` Conflict.

---

## Authentication

### POST `/auth/sign-up`

Create a new account. No auth required.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| email | string | yes | Valid email format |
| password | string | yes | Min 8 characters |

**Response:** `201`

```json
{
  "user": {
    "id": "string",
    "email": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `400` validation, `409` email already registered.

---

### POST `/auth/sign-in`

Get a JWT token. No auth required.

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| email | string | yes |
| password | string | yes |

**Response:** `200`

```json
{
  "token": "eyJ...",
  "expiresIn": 86400,
  "user": {
    "id": "string",
    "email": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `401` invalid credentials.

---

## API Keys

All endpoints require `Authorization: Bearer <token>`.

### POST `/api-keys`

Create a new API key. The full key is only returned once.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 1-100 characters |
| expiresAt | string | no | ISO 8601 datetime |

**Response:** `201`

```json
{
  "apiKey": {
    "id": "string",
    "name": "string",
    "key": "fh_...",
    "keyPrefix": "fh_abc12",
    "createdAt": "ISO 8601",
    "expiresAt": "ISO 8601 | null"
  }
}
```

---

### GET `/api-keys`

List all API keys for the current user.

**Response:** `200`

```json
{
  "apiKeys": [
    {
      "id": "string",
      "name": "string",
      "keyPrefix": "string",
      "createdAt": "ISO 8601",
      "expiresAt": "ISO 8601 | null",
      "lastUsedAt": "ISO 8601 | null"
    }
  ]
}
```

---

### DELETE `/api-keys/:id`

Delete an API key.

**Response:** `200`

```json
{
  "success": true
}
```

**Errors:** `404` key not found.

---

## Teams

All endpoints require `Authorization: Bearer <token>`.

### POST `/teams`

Create a team. Max 5 teams per user.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 1-100 characters |

**Response:** `201`

```json
{
  "team": {
    "id": "string",
    "name": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `409` max teams reached.

---

### GET `/teams`

List all teams the current user belongs to.

**Response:** `200`

```json
{
  "teams": [
    {
      "id": "string",
      "name": "string",
      "createdAt": "ISO 8601"
    }
  ]
}
```

---

### GET `/teams/:id`

Get a single team by ID.

**Response:** `200`

```json
{
  "team": {
    "id": "string",
    "name": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `404` not found, `403` not a member.

---

### PUT `/teams/:id`

Update a team's name.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 1-100 characters |

**Response:** `200`

```json
{
  "team": {
    "id": "string",
    "name": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `404`, `403`.

---

### DELETE `/teams/:id`

Delete a team and all associated data.

**Response:** `200`

```json
{
  "success": true
}
```

**Errors:** `404`, `403`.

---

### POST `/teams/:id/members`

Add a user to a team.

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| userId | string | yes |

**Response:** `201`

```json
{
  "member": {
    "id": "string",
    "teamId": "string",
    "userId": "string",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `404` user or team not found, `403` not a member, `409` already a member.

---

### GET `/teams/:id/members`

List members of a team.

**Response:** `200`

```json
{
  "members": [
    {
      "id": "string",
      "teamId": "string",
      "userId": "string",
      "createdAt": "ISO 8601"
    }
  ]
}
```

**Errors:** `404`, `403`.

---

### DELETE `/teams/:id/members/:userId`

Remove a user from a team.

**Response:** `200`

```json
{
  "success": true
}
```

**Errors:** `404`, `403`.

---

## Sites

All endpoints require `Authorization: Bearer <token>`.

### POST `/sites`

Add a site to a team. Max 10 sites per team.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| teamId | string | yes | |
| domain | string | yes | 1-255 characters |
| sitemapPath | string | no | 1-255 characters, defaults to `/sitemap.xml` |

**Response:** `201`

```json
{
  "site": {
    "id": "string",
    "teamId": "string",
    "domain": "string",
    "sitemapPath": "string",
    "lastScrapedSitemapAt": "ISO 8601 | null",
    "scrapeSitemapError": "string | null",
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `403` not a team member, `404` team not found, `409` max sites reached.

---

### GET `/sites`

List sites. Optionally filter by team.

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| teamId | string | no | Filter by team |

**Response:** `200`

```json
{
  "sites": [
    {
      "id": "string",
      "teamId": "string",
      "domain": "string",
      "sitemapPath": "string",
      "lastScrapedSitemapAt": "ISO 8601 | null",
      "scrapeSitemapError": "string | null",
      "createdAt": "ISO 8601"
    }
  ]
}
```

---

### GET `/sites/:id`

Get a single site.

**Response:** `200`

```json
{
  "site": { ... }
}
```

**Errors:** `404`, `403`.

---

### PUT `/sites/:id`

Update a site's domain or sitemap path.

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| domain | string | no | 1-255 characters |
| sitemapPath | string | no | 1-255 characters |

**Response:** `200`

```json
{
  "site": { ... }
}
```

**Errors:** `404`, `403`.

---

### DELETE `/sites/:id`

Delete a site.

**Response:** `200`

```json
{
  "success": true
}
```

**Errors:** `404`, `403`.

---

## Pages

All endpoints require `Authorization: Bearer <token>`.

### GET `/pages`

List pages. Optionally filter by site and search by URL/path.

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| siteId | string | no | Filter by site |
| search | string | no | Regex search on URL or path (case-insensitive) |

**Response:** `200`

```json
{
  "pages": [
    {
      "id": "string",
      "siteId": "string",
      "path": "string",
      "url": "string",
      "lastAuditedAt": "ISO 8601 | null",
      "auditError": "string | null",
      "auditReport": "PageAuditReport | null",
      "createdAt": "ISO 8601"
    }
  ]
}
```

---

### GET `/pages/:id`

Get a single page with its full audit report.

**Response:** `200`

```json
{
  "page": {
    "id": "string",
    "siteId": "string",
    "path": "string",
    "url": "string",
    "lastAuditedAt": "ISO 8601 | null",
    "auditError": "string | null",
    "auditReport": {
      "fetchTime": "ISO 8601",
      "finalUrl": "string",
      "durationMs": 0,
      "performance": {
        "score": 0.85,
        "audits": [
          {
            "id": "string",
            "title": "string",
            "score": 0.5,
            "displayValue": "string | undefined",
            "numericValue": 0
          }
        ]
      },
      "accessibility": { "score": 0.92, "audits": [...] },
      "bestPractices": { "score": 1.0, "audits": [...] },
      "seo": { "score": 0.95, "audits": [...] },
      "fieldData": {
        "metric_name": {
          "percentile": 0,
          "distributions": [
            { "min": 0, "max": 100, "proportion": 0.5 }
          ],
          "category": "string"
        }
      }
    },
    "createdAt": "ISO 8601"
  }
}
```

**Errors:** `404`, `403`.

---

## Issues

All endpoints require `Authorization: Bearer <token>`.

### GET `/issues`

Aggregated audit failures across pages, sorted by number of affected pages (most widespread first).

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| siteId | string | no | Filter by site |
| category | string | no | One of: `performance`, `accessibility`, `bestPractices`, `seo` |

**Response:** `200`

```json
{
  "issues": [
    {
      "auditId": "string",
      "title": "string",
      "category": "string",
      "pages": [
        {
          "pageId": "string",
          "url": "string",
          "path": "string",
          "score": 0.45,
          "displayValue": "string | null"
        }
      ]
    }
  ]
}
```

- Issues sorted by number of affected pages (descending).
- Pages within each issue sorted by score (ascending — worst scores first).
- Scores range from `0` (fail) to `1` (pass).

**Errors:** `400` invalid category.

---

## Rate Limits

Per-IP rate limits apply to all routes:

| Route prefix | Requests | Window |
|-------------|----------|--------|
| `/auth/*` | 10 | 60 seconds |
| `/teams/*` | 60 | 60 seconds |
| `/sites/*` | 60 | 60 seconds |
| `/pages/*` | 60 | 60 seconds |
| `/issues/*` | 60 | 60 seconds |
| `/api-keys/*` | 60 | 60 seconds |
