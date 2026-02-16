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
