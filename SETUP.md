# CA Firm CRM — Setup Guide

## Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

## 1. Install dependencies
```bash
pnpm install
```

## 2. Configure environment
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```
Edit both files with your actual values.

## 3. Database setup
```bash
# Create the database in PostgreSQL first, then:
pnpm db:generate   # generate Prisma client
pnpm db:migrate    # run migrations
pnpm db:seed       # seed test accounts
```

## 4. Development
```bash
pnpm dev           # starts both api (port 4000) and web (port 3000)
# or separately:
pnpm dev:api
pnpm dev:web
```

## 5. Test accounts (after seed)
| Role    | Email                  | Password     |
|---------|------------------------|--------------|
| Partner | partner@cafirm.com     | Partner@123  |
| Manager | manager@cafirm.com     | Manager@123  |
| Trainee | trainee@cafirm.com     | Trainee@123  |
| Client  | client@example.com     | Client@123   |

## 6. Production deployment (PM2)
```bash
pnpm build
pm2 start ecosystem.config.js
```

## API Base URL
- Dev:  http://localhost:4000/api
- All endpoints require `Authorization: Bearer <token>` except `POST /api/auth/login`

## Key API Endpoints
| Method | Path                                | Description                  |
|--------|-------------------------------------|------------------------------|
| POST   | /auth/login                         | Login                        |
| POST   | /auth/logout                        | Logout                       |
| GET    | /auth/me                            | Current user                 |
| POST   | /auth/refresh                       | Refresh access token         |
| GET    | /users                              | List users (role-scoped)     |
| POST   | /users                              | Create user                  |
| GET    | /clients                            | List clients                 |
| GET    | /clients/my-profile                 | Client's own profile         |
| PUT    | /clients/:id                        | Update client profile        |
| GET    | /tax-returns                        | List returns (role-scoped)   |
| POST   | /tax-returns                        | Create new return            |
| PATCH  | /tax-returns/:id/status             | Update status                |
| PATCH  | /tax-returns/:id/assign             | Assign to trainee            |
| GET    | /documents?taxReturnId=X            | List documents               |
| POST   | /documents/upload                   | Upload document (multipart)  |
| GET    | /chat/conversations                 | List conversations           |
| POST   | /chat/conversations                 | Get or create conversation   |
| GET    | /chat/conversations/:id/messages    | Load messages                |
| GET    | /notifications                      | Get notifications            |
| PATCH  | /notifications/:id/read             | Mark as read                 |
| GET    | /dashboard/stats                    | Dashboard statistics         |

## Socket.IO (Chat)
- Namespace: `/chat`
- Auth: `{ auth: { token: '<access_token>' } }`
- Events to emit: `join_conversation`, `send_message`, `mark_read`
- Events to listen: `new_message`
