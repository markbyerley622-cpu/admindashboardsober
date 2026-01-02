# Admin Verification System - Web3 Sobriety Platform

Production-ready admin server and control panel for task verification and moderation.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- MinIO or S3-compatible storage (for proof files)

### 1. Setup Database

```bash
# Start PostgreSQL (using Docker)
docker run -d \
  --name postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=admin_verification \
  -p 5432:5432 \
  postgres:15
```

### 2. Setup Object Storage (MinIO)

```bash
# Start MinIO for local development
docker run -d \
  --name minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 \
  -p 9001:9001 \
  minio/minio server /data --console-address ":9001"

# Create the proofs bucket
# Visit http://localhost:9001 and login with minioadmin/minioadmin
# Or use mc CLI: mc mb local/proofs
```

### 3. Setup Admin Server

```bash
cd admin-server

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env

# Edit .env with your settings:
# - DATABASE_URL=postgresql://admin:password@localhost:5432/admin_verification
# - JWT_SECRET=your-secret-key-at-least-32-characters-long
# - WEBHOOK_SECRET=your-webhook-secret-16-chars
# - S3_ACCESS_KEY=minioadmin
# - S3_SECRET_KEY=minioadmin

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start development server
npm run dev
```

Server runs on http://localhost:4000

### 4. Setup Admin Dashboard

```bash
cd admin-dashboard

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1" > .env.local

# Start development server
npm run dev
```

Dashboard runs on http://localhost:3001

### 5. Create First Admin User

```bash
# Use the seed script or run directly:
cd admin-server

# Create admin via Prisma Studio
npm run db:studio

# Or create via API (requires existing super admin)
curl -X POST http://localhost:4000/api/v1/auth/admins \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <super_admin_token>" \
  -d '{"email":"admin@example.com","password":"securepassword123","role":"ADMIN"}'
```

## Terminal Commands Reference

### Admin Server

```bash
cd admin-server

# Development
npm run dev          # Start with hot reload
npm run build        # Build for production
npm start            # Run production build

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes
npm run db:migrate   # Create migration
npm run db:studio    # Open Prisma Studio GUI
```

### Admin Dashboard

```bash
cd admin-dashboard

# Development
npm run dev          # Start on port 3001
npm run build        # Build for production
npm start            # Run production build
npm run lint         # Run linter
```

### Docker Compose (Production)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f admin-server
docker-compose logs -f admin-dashboard

# Stop all services
docker-compose down
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Admin login
- `POST /api/v1/auth/logout` - Admin logout
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Get current admin
- `POST /api/v1/auth/admins` - Create admin (super admin only)

### Submissions
- `GET /api/v1/submissions` - List submissions (paginated)
- `GET /api/v1/submissions/stats` - Dashboard stats
- `GET /api/v1/submissions/categories` - Get task categories
- `GET /api/v1/submissions/:id` - Get submission detail
- `POST /api/v1/submissions/:id/approve` - Approve submission
- `POST /api/v1/submissions/:id/reject` - Reject submission
- `POST /api/v1/submissions/:id/flag` - Flag for review

### Upload (User App)
- `POST /api/v1/upload/request` - Get signed upload URL
- `POST /api/v1/upload/confirm` - Confirm upload complete

### Integration (User App Backend)
- `POST /api/v1/integration/submission/status` - Get submission status
- `POST /api/v1/integration/submissions/history` - Get user history
- `POST /api/v1/integration/reward/claim` - Initiate reward claim
- `POST /api/v1/integration/reward/confirm` - Confirm reward paid
- `POST /api/v1/integration/user/stats` - Get user stats

## Security Notes

1. **All integration endpoints require HMAC signatures** - User app must sign requests
2. **Admin endpoints require JWT authentication** - Token in Authorization header
3. **Rate limiting is enabled** - 100 requests per 15 minutes for general, 10 for auth
4. **Proof files are never publicly accessible** - Signed URLs only, expire in 1 hour
5. **All moderation actions are logged** - Full audit trail in database

## Integration with User App

Your user app should:

1. **Request upload URL** before user uploads proof
2. **Upload directly to S3** using signed URL
3. **Confirm upload** to create pending submission
4. **Poll or use webhooks** to check submission status
5. **Claim rewards** when status is APPROVED
6. **Confirm reward payment** after blockchain transaction

### Webhook Events

When enabled, the admin server sends webhooks for:
- `submission.approved` - Task approved, reward unlocked
- `submission.rejected` - Task rejected with reason
- `submission.flagged` - Flagged for senior review
- `user.suspended` - User account suspended
- `reward.pending` - Reward claim initiated
- `reward.paid` - Reward transaction confirmed

## Environment Variables

### Admin Server (.env)

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=min-32-char-secret
JWT_EXPIRES_IN=24h
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=proofs
CORS_ORIGINS=http://localhost:3001
WEBHOOK_SECRET=min-16-char-secret
USER_APP_WEBHOOK_URL=http://localhost:3000/api/webhooks/admin
```

### Admin Dashboard (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## File Structure

```
├── admin-server/
│   ├── src/
│   │   ├── config/          # Environment config
│   │   ├── controllers/     # (future use)
│   │   ├── middleware/      # Auth, error handling
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Helpers
│   │   └── index.ts         # Server entry
│   └── prisma/
│       └── schema.prisma    # Database schema
│
├── admin-dashboard/
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks
│   │   ├── lib/             # API client
│   │   └── types/           # TypeScript types
│   └── public/
│
└── README.md
```
