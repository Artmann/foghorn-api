export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Foghorn API',
    version: '1.0.0',
    description: 'API for authentication and API key management.'
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Service is healthy.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    service: { type: 'string' },
                    status: { type: 'string' }
                  },
                  required: ['service', 'status']
                }
              }
            }
          }
        }
      }
    },
    '/auth/sign-up': {
      post: {
        tags: ['Auth'],
        summary: 'Create a new account',
        operationId: 'signUp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Account created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/UserDto' }
                  },
                  required: ['user']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '409': {
            description: 'Email already registered.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/auth/sign-in': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in to an existing account',
        operationId: 'signIn',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Signed in successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    expiresIn: { type: 'integer' },
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/UserDto' }
                  },
                  required: ['expiresIn', 'token', 'user']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Invalid credentials.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api-keys': {
      post: {
        tags: ['API Keys'],
        summary: 'Create a new API key',
        operationId: 'createApiKey',
        security: [{ Bearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  expiresAt: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true
                  }
                },
                required: ['name']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'API key created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKey: { $ref: '#/components/schemas/CreateApiKeyDto' }
                  },
                  required: ['apiKey']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      get: {
        tags: ['API Keys'],
        summary: 'List all API keys',
        operationId: 'listApiKeys',
        security: [{ Bearer: [] }],
        responses: {
          '200': {
            description: 'List of API keys.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKeys: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ApiKeyDto' }
                    }
                  },
                  required: ['apiKeys']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/teams': {
      post: {
        tags: ['Teams'],
        summary: 'Create a new team',
        operationId: 'createTeam',
        security: [{ Bearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 }
                },
                required: ['name']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Team created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    team: { $ref: '#/components/schemas/TeamDto' }
                  },
                  required: ['team']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      get: {
        tags: ['Teams'],
        summary: 'List teams the authenticated user belongs to',
        operationId: 'listTeams',
        security: [{ Bearer: [] }],
        responses: {
          '200': {
            description: 'List of teams.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    teams: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TeamDto' }
                    }
                  },
                  required: ['teams']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/teams/{id}': {
      get: {
        tags: ['Teams'],
        summary: 'Get a single team',
        operationId: 'getTeam',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Team details.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    team: { $ref: '#/components/schemas/TeamDto' }
                  },
                  required: ['team']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      put: {
        tags: ['Teams'],
        summary: 'Update team name',
        operationId: 'updateTeam',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 }
                },
                required: ['name']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Team updated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    team: { $ref: '#/components/schemas/TeamDto' }
                  },
                  required: ['team']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      delete: {
        tags: ['Teams'],
        summary: 'Delete a team',
        operationId: 'deleteTeam',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Team deleted.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' }
                  },
                  required: ['success']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/teams/{id}/members': {
      post: {
        tags: ['Teams'],
        summary: 'Add a member to a team',
        operationId: 'addTeamMember',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  userId: { type: 'string' }
                },
                required: ['userId']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Member added.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    member: { $ref: '#/components/schemas/TeamMemberDto' }
                  },
                  required: ['member']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team or user not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '409': {
            description: 'User is already a member.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      get: {
        tags: ['Teams'],
        summary: 'List members of a team',
        operationId: 'listTeamMembers',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'List of team members.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    members: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TeamMemberDto' }
                    }
                  },
                  required: ['members']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/teams/{id}/members/{userId}': {
      delete: {
        tags: ['Teams'],
        summary: 'Remove a member from a team',
        operationId: 'removeTeamMember',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Member removed.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' }
                  },
                  required: ['success']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team or member not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/sites': {
      post: {
        tags: ['Sites'],
        summary: 'Create a site for a team',
        operationId: 'createSite',
        security: [{ Bearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  teamId: { type: 'string' },
                  domain: { type: 'string', minLength: 1, maxLength: 255 },
                  sitemapPath: { type: 'string', minLength: 1, maxLength: 255 }
                },
                required: ['teamId', 'domain']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Site created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    site: { $ref: '#/components/schemas/SiteDto' }
                  },
                  required: ['site']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      get: {
        tags: ['Sites'],
        summary: 'List all sites for a team',
        operationId: 'listSites',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'teamId',
            in: 'query',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'List of sites.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sites: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SiteDto' }
                    }
                  },
                  required: ['sites']
                }
              }
            }
          },
          '400': {
            description: 'Missing teamId query parameter.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Team not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/sites/{id}': {
      get: {
        tags: ['Sites'],
        summary: 'Get a single site',
        operationId: 'getSite',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Site details.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    site: { $ref: '#/components/schemas/SiteDto' }
                  },
                  required: ['site']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Site not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      put: {
        tags: ['Sites'],
        summary: 'Update a site',
        operationId: 'updateSite',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  domain: { type: 'string', minLength: 1, maxLength: 255 },
                  sitemapPath: { type: 'string', minLength: 1, maxLength: 255 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Site updated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    site: { $ref: '#/components/schemas/SiteDto' }
                  },
                  required: ['site']
                }
              }
            }
          },
          '400': {
            description: 'Validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Site not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      },
      delete: {
        tags: ['Sites'],
        summary: 'Delete a site',
        operationId: 'deleteSite',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Site deleted.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' }
                  },
                  required: ['success']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Site not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/issues': {
      get: {
        tags: ['Issues'],
        summary: 'List audit issues across pages',
        operationId: 'listIssues',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'siteId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Filter issues by site. If omitted, returns issues across all accessible sites.'
          },
          {
            name: 'category',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['performance', 'accessibility', 'bestPractices', 'seo']
            },
            description: 'Filter issues to a single Lighthouse category.'
          }
        ],
        responses: {
          '200': {
            description: 'List of issues.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    issues: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/IssueDto' }
                    }
                  },
                  required: ['issues']
                }
              }
            }
          },
          '400': {
            description: 'Invalid category value.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Site not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/pages': {
      get: {
        tags: ['Pages'],
        summary: 'List pages the user has access to',
        operationId: 'listPages',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'siteId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Filter pages by site. If omitted, returns pages across all accessible sites.'
          },
          {
            name: 'search',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Case-insensitive search term matched against page URL and path.'
          }
        ],
        responses: {
          '200': {
            description: 'List of pages.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    pages: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/PageDto' }
                    }
                  },
                  required: ['pages']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Site not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/pages/{id}': {
      get: {
        tags: ['Pages'],
        summary: 'Get a single page',
        operationId: 'getPage',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Page details.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    page: { $ref: '#/components/schemas/PageDto' }
                  },
                  required: ['page']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '403': {
            description: 'Not a member of this team.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'Page not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/api-keys/{id}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Delete an API key',
        operationId: 'deleteApiKey',
        security: [{ Bearer: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'API key deleted.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' }
                  },
                  required: ['success']
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          },
          '404': {
            description: 'API key not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      Bearer: {
        type: 'http',
        scheme: 'bearer'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            },
            required: ['message']
          }
        },
        required: ['error']
      },
      UserDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'email', 'createdAt']
      },
      ApiKeyDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          keyPrefix: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          expiresAt: {
            type: ['string', 'null'],
            format: 'date-time'
          },
          lastUsedAt: {
            type: ['string', 'null'],
            format: 'date-time'
          }
        },
        required: [
          'id',
          'name',
          'keyPrefix',
          'createdAt',
          'expiresAt',
          'lastUsedAt'
        ]
      },
      TeamDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'name', 'createdAt']
      },
      TeamMemberDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          teamId: { type: 'string' },
          userId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'teamId', 'userId', 'createdAt']
      },
      SiteDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          teamId: { type: 'string' },
          domain: { type: 'string' },
          sitemapPath: { type: 'string' },
          lastScrapedSitemapAt: {
            type: ['string', 'null'],
            format: 'date-time'
          },
          scrapeSitemapError: {
            type: ['string', 'null']
          },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: [
          'id',
          'teamId',
          'domain',
          'sitemapPath',
          'lastScrapedSitemapAt',
          'scrapeSitemapError',
          'createdAt'
        ]
      },
      PageDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          siteId: { type: 'string' },
          path: { type: 'string' },
          url: { type: 'string' },
          lastAuditedAt: {
            type: ['string', 'null'],
            format: 'date-time'
          },
          auditError: {
            type: ['string', 'null']
          },
          auditReport: {
            type: ['object', 'null'],
            description:
              'Full Lighthouse audit report, or null if not yet audited.'
          },
          createdAt: { type: 'string', format: 'date-time' }
        },
        required: [
          'id',
          'siteId',
          'path',
          'url',
          'lastAuditedAt',
          'auditError',
          'auditReport',
          'createdAt'
        ]
      },
      IssuePageDto: {
        type: 'object',
        properties: {
          pageId: { type: 'string' },
          url: { type: 'string' },
          path: { type: 'string' },
          score: { type: 'number' },
          displayValue: { type: ['string', 'null'] }
        },
        required: ['pageId', 'url', 'path', 'score', 'displayValue']
      },
      IssueDto: {
        type: 'object',
        properties: {
          auditId: { type: 'string' },
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: ['performance', 'accessibility', 'bestPractices', 'seo']
          },
          pages: {
            type: 'array',
            items: { $ref: '#/components/schemas/IssuePageDto' }
          }
        },
        required: ['auditId', 'title', 'category', 'pages']
      },
      CreateApiKeyDto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          key: { type: 'string' },
          keyPrefix: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          expiresAt: {
            type: ['string', 'null'],
            format: 'date-time'
          }
        },
        required: ['id', 'name', 'key', 'keyPrefix', 'createdAt', 'expiresAt']
      }
    }
  }
} as const
