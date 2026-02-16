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
