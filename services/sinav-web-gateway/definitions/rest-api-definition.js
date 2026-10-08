export default {
  openapi: '3.0.0',
  info: {
    title: 'Web Gateway',
    description: 'API Gateway service',
    version: 'v1',
  },
  servers: [
    {
      url: 'http://127.0.0.1:1000/api/web-gateway',
      description: 'Gateway server',
    },
  ],
  paths: {
    '/api/gateway/refresh': {
      post: {
        summary: 'Rotate session: yeni access JWT + yeni refresh token cookies',
        tags: ['Gateway'],
        responses: {
          200: { description: 'OK — yeni cookies set' },
          401: {
            description:
              'RT_INVALID | RT_REUSED | SESSION_GONE — cookies cleared',
          },
        },
      },
    },
    '/api/gateway/logout': {
      post: {
        summary: 'Revoke current session + audit (fire-and-forget identity)',
        tags: ['Gateway'],
        responses: {
          200: { description: 'OK — session revoke + cookies cleared' },
          401: { description: 'TOKEN_MISSING | TOKEN_INVALID | TOKEN_REVOKED' },
        },
      },
    },
    '/api/gateway/logout-all': {
      post: {
        summary: 'Revoke all sessions for the current user',
        tags: ['Gateway'],
        responses: {
          200: { description: 'OK — all sessions revoked' },
          401: { description: 'TOKEN_MISSING | TOKEN_INVALID | TOKEN_REVOKED' },
        },
      },
    },
    '/api/gateway/me': {
      get: {
        summary: 'Current session identity hydration (mount-time /me)',
        tags: ['Gateway'],
        responses: {
          200: { description: 'OK — { user, organization, permissions }' },
          401: { description: 'TOKEN_MISSING | TOKEN_INVALID | TOKEN_REVOKED' },
        },
      },
    },
    '/api/gateway/sessions/revoke-by-role': {
      post: {
        summary: 'Admin: revoke all active sessions matching role',
        tags: ['Gateway'],
        responses: {
          200: { description: 'OK — { revokedCount, role }' },
          400: { description: 'INVALID_ROLE' },
          403: {
            description:
              'PERMISSION_DENIED — requires platform:session:revoke',
          },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Liveness probe',
        tags: ['Gateway'],
        responses: { 200: { description: '{ status: "ok" }' } },
      },
    },
  },
  components: {
    schemas: {
      IntegerSchema: {
        type: 'integer',
        example: 0,
      },
      StringSchema: {
        type: 'string',
        example: 'qwerty',
      },
      BooleanSchema: {
        type: 'boolean',
      },
      TimeSchema: {
        type: 'string',
        format: 'time',
      },
      VersionSchema: {
        type: 'string',
        enum: ['v1', 'v2'],
      },
      PostLoginRequest: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
          },
          password: {
            type: 'string',
          },
        },
        example: {
          username: 'test',
          password: '0000',
        },
      },
      PostLoginResponse: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
          },
          user: {
            type: 'object',
          },
        },
        example: {
          message: 'Successfully Login!',
        },
      },
    },
  },
};
