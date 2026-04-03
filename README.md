# UJRIS Lite v3.0.0

**Unified Justice & Rights Intelligence System** — AI-powered legal case preparation platform.

---

## Architecture

```
src/
├── server.ts              # Bootstrap + graceful shutdown
├── app.ts                 # Express factory + middleware stack
├── lib/
│   ├── logger.ts          # Pino structured logger
│   ├── prisma.ts          # Prisma client singleton
│   └── redis.ts           # Redis client with graceful fallback
├── middleware/
│   ├── auth.ts            # JWT auth + admin key + ownership guard
│   ├── errorHandler.ts    # Global error handler + AppError hierarchy
│   ├── notFoundHandler.ts # 404 handler
│   ├── rateLimiter.ts     # Global + AI + auth rate limiters
│   └── upload.ts          # Multer file upload + MIME validation
├── services/
│   └── aiService.ts       # Anthropic SDK wrapper + retry logic
├── engines/
│   ├── intakeEngine.ts    # Intake validation + next questions (AI)
│   ├── evidenceEngine.ts  # File processing + PDF parse + evidence summary (AI)
│   ├── caseGenerationEngine.ts # Full case document generation (AI)
│   ├── refundEngine.ts    # Eligibility + request + decision + processing
│   └── auditEngine.ts     # Audit log creation + retrieval
└── routes/
    ├── auth.ts            # /api/auth — register, login, logout, me
    ├── cases.ts           # /api/cases — full CRUD + generate + evidence + intake
    ├── refunds.ts         # /api/refunds — eligibility, request, list
    └── admin.ts           # /api/admin — cases, users, refunds, stats, audit
```

---

## Quick Start

### 1. Clone and configure

```bash
cp .env.example .env
# Fill in: JWT_SECRET, ADMIN_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL
```

### 2. Docker (recommended)

```bash
docker-compose up -d
```

### 3. Local development

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Min 64-char secret for JWT signing |
| `ADMIN_API_KEY` | ✅ | — | Secret key for admin API access |
| `ANTHROPIC_API_KEY` | ✅ | — | Anthropic API key |
| `REDIS_URL` | ❌ | — | Redis URL (falls back to in-memory) |
| `AI_MODEL` | ❌ | `claude-opus-4-5` | Anthropic model |
| `AI_MAX_TOKENS` | ❌ | `4096` | Max tokens per AI request |
| `AI_MAX_RETRIES` | ❌ | `3` | AI retry attempts |
| `MAX_FILE_SIZE_MB` | ❌ | `10` | Max upload file size |
| `REFUND_BASE_AMOUNT` | ❌ | `99.00` | Default refund amount |
| `REFUND_CURRENCY` | ❌ | `GBP` | Refund currency |
| `CORS_ORIGINS` | ❌ | `http://localhost:3000` | Comma-separated allowed origins |
| `LOG_LEVEL` | ❌ | `info` | Pino log level |

---

## API Reference

### Authentication

All case and refund routes require `Authorization: Bearer <token>`.

Admin routes require `X-Admin-Key: <admin_api_key>`.

### Auth Routes (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | None | Register new user |
| POST | `/login` | None | Login, returns JWT |
| POST | `/logout` | JWT | Revoke token |
| GET | `/me` | JWT | Get current user |

### Case Routes (`/api/cases`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List user's cases (paginated) |
| POST | `/` | JWT | Create case (intake) |
| GET | `/:caseId` | JWT | Get full case |
| PATCH | `/:caseId` | JWT | Update intake fields |
| DELETE | `/:caseId` | JWT | Delete case |
| POST | `/:caseId/intake/questions` | JWT | Generate AI follow-up questions |
| POST | `/:caseId/generate` | JWT | Generate full case document (AI) |
| POST | `/:caseId/evidence` | JWT | Upload evidence files |
| POST | `/:caseId/evidence/summarise` | JWT | Generate AI evidence summary |
| DELETE | `/:caseId/evidence/:evidenceId` | JWT | Delete evidence item |
| GET | `/:caseId/audit` | JWT | Get case audit trail |

### Refund Routes (`/api/refunds`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/eligibility/:caseId` | JWT | Check refund eligibility |
| POST | `/` | JWT | Submit refund request |
| GET | `/` | JWT | List user's refund requests |
| GET | `/:refundRequestId` | JWT | Get specific refund request |

### Admin Routes (`/api/admin`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/cases` | Admin Key | List all cases |
| GET | `/cases/:caseId` | Admin Key | Get full case |
| PATCH | `/cases/:caseId/status` | Admin Key | Change case status |
| GET | `/cases/:caseId/audit` | Admin Key | Get case audit log |
| GET | `/refunds` | Admin Key | List all refund requests |
| POST | `/refunds/:id/decide` | Admin Key | Approve/reject refund |
| POST | `/refunds/:id/process` | Admin Key | Mark refund processed |
| GET | `/users` | Admin Key | List all users |
| PATCH | `/users/:userId/deactivate` | Admin Key | Deactivate user |
| GET | `/stats` | Admin Key | Platform statistics |
| GET | `/audit` | Admin Key | Global audit log |

---

## Case Lifecycle

```
INTAKE → EVIDENCE_PENDING → GENERATING → ACTIVE → RESOLVED → CLOSED
                                              ↓
                                    REFUND_REQUESTED → REFUNDED → CLOSED
```

---

## Refund Logic

1. **Eligibility check**: Case must be `ACTIVE` or `RESOLVED`, no existing pending refund, within 30-day window post-generation
2. **Amount calculation**: Base amount (£99.00 default) adjusted by case strength score and status
3. **Request**: User submits reason (min 10 chars), case moves to `REFUND_REQUESTED`
4. **Admin decision**: Approve (with optional reduced amount) or reject
5. **Processing**: Admin marks payment processed → case closes

---

## Security

- Helmet CSP + HSTS headers
- CORS origin whitelist
- JWT RS256 (HS256 with secret min 64 chars)
- Admin API key on all admin routes
- Global rate limiter (100 req/15min)
- AI-specific rate limiter (20 req/15min per user)
- Auth-specific rate limiter (10 req/15min)
- File upload: MIME type validation, size limit, SHA-256 dedup
- All passwords bcrypt hashed (cost 12)
- Full audit trail on all mutating operations

---

## Running Tests

```bash
npm test
npm test -- --coverage
```
