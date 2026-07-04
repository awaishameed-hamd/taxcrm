export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    accessSecret:   process.env.JWT_ACCESS_SECRET  ?? 'change-me-access',
    refreshSecret:  process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessExpiresIn:  process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  upload: {
    dir:         process.env.UPLOAD_DIR    ?? './uploads',
    maxFileMb:   parseInt(process.env.MAX_FILE_SIZE_MB ?? '50', 10),
  },

  resend: {
    apiKey:    process.env.RESEND_API_KEY    ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'noreply@cafirm.com',
    fromName:  process.env.RESEND_FROM_NAME  ?? 'CA Firm CRM',
  },

  clientUrl:       process.env.CLIENT_URL        ?? 'http://localhost:3000',
  socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:3000',
})
