# WellOra Hospital — Backend

REST API for the **WellOra Hospital** platform: patients book consultations, doctors manage schedules, and administrators oversee hospital operations. This repository contains the backend codebase.

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · JWT auth

---

## Where the project stands today

This is an early-stage build. Currently, **authentication is fully functional** — users can register as patients, log in, fetch their profile information, and handle token refreshing. Features like appointment bookings, doctor scheduling, prescription management, and payment integrations are planned as per the project requirements.

Please review the [Known limitations](https://www.google.com/search?q=%2523known-limitations&utm_source=gemini) section before troubleshooting.

---

## Prerequisites

| Tool | Version | Check with |
| --- | --- | --- |
| **Node.js** | 20+ | `node -v` |
| **PostgreSQL** | 14+ | `psql -V` |

Any package manager works (`npm`, `pnpm`, `yarn`, `bun`). The examples below use `npm`.

---

## Getting started

### 1. Install dependencies

```bash
npm install

```

### 2. Set up your environment file

```bash
cp .env.example .env

```

Open `.env` and configure your `DATABASE_URL` pointing to your local or hosted PostgreSQL instance:

```env
DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/wellora_hospital?schema=public"

```

*(The database doesn't need to exist beforehand — `prisma migrate dev` creates it automatically.)*

### 3. Generate the Prisma client

```bash
npx prisma generate

```

Prisma writes a typed client into `src/generated/prisma`. This folder is git-ignored, so a fresh clone requires this step to compile correctly.

### 4. Run the migrations

```bash
npx prisma migrate dev

```

This applies the database schema migrations.

### 5. Start the development server

```bash
npm run dev

```

You should see:

```text
Connected to the database successfully.
Server is running on port 5000

```

Confirm it's up:

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to WellOra Hospital System Backend"}

```

---

## Environment variables

Configured in `src/app/config/index.ts`:

| Variable | Description |
| --- | --- |
| `NODE_ENV` | Environment mode (`development` / `production`) |
| `PORT` | HTTP server port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret key for access tokens |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifespan (e.g., `15m`, `1d`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifespan |
| `BCRYPT_SALT_ROUNDS` | Salt rounds for hashing |
| `FRONTEND_URL` | Allowed origin for CORS |

---

## Project structure

```text
src/
├── server.ts                       # Database connection and server initialization
├── app.ts                          # Express configuration (CORS, middleware, routes)
├── generated/prisma/               # Generated Prisma client (git-ignored)
└── app/
    ├── config/index.ts             # Environment variables mapping
    ├── lib/prisma.ts               # Shared PrismaClient instance
    ├── middleware/
    │   ├── checkAuth.ts            # JWT verification and role-based guard
    │   ├── globalErrorHandler.ts   # Global exception handler
    │   └── notFound.ts             # 404 handler
    ├── utils/
    │   ├── catchAsync.ts           # Async handler wrapper
    │   ├── jwt.ts                  # Token utilities
    │   └── sendResponse.ts         # Standardized API response format
    └── module/
        └── auth/                   # Authentication module
            ├── auth.route.ts
            ├── auth.controller.ts
            ├── auth.service.ts
            └── auth.interface.ts

prisma/
├── schema/
│   ├── schema.prisma               # Generator & datasource config
│   ├── user.prisma
│   ├── patient.prisma
│   └── enums.prisma                # Roles, Statuses, Genders
└── migrations/                     # SQL migration history

```

---

## API Endpoints

Base URL: `http://localhost:5000`

| Method | Endpoint | Auth Required | Description |
| --- | --- | --- | --- |
| `GET` | `/` | No | Health check |
| `POST` | `/api/v1/auth/register` | No | Register a new patient account |
| `POST` | `/api/v1/auth/login` | No | Authenticate user & issue tokens |
| `GET` | `/api/v1/auth/me` | Yes | Fetch authenticated user profile |
| `POST` | `/api/v1/auth/refresh-token` | No | Generate a new access token |

### Response Format

All API responses follow a uniform envelope structure:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {}
}

```

---

## Roles & Authentication

The system supports four user roles in the schema: `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, and `PATIENT`.

* **Patient Registration:** Public registration defaults to the `PATIENT` role.
* **Elevated Roles:** To test admin or doctor accounts, register a user normally and update their `role` column directly in the database (e.g., via `npx prisma studio` at `http://localhost:5555`), then log back in.

---

## Known limitations

* **HTTP Status Codes on Errors:** The global error handler processes status codes internally but currently defaults to returning HTTP 500 for responses; rely on the error `message` for debugging.
* **Request Validation:** Incoming payloads currently lack schema validation (e.g., Zod validation), relying primarily on database constraints.
* **Tests:** `npm test` is a placeholder.

---

## Scripts

```bash
npm run dev     # Start development server with auto-reload (tsx watch)
npm run build   # Type-check with TypeScript compiler
npm run start   # Run the application in production mode

```

---

## Troubleshooting

* **`Cannot find module '.../src/generated/prisma/client'`**
Run `npx prisma generate` to build the Prisma client.
* **`Can't reach database server`**
Ensure PostgreSQL is running and your `DATABASE_URL` credentials are accurate.
* **Login/Registration fails unexpectedly**
Verify that your JWT secrets are correctly configured in your `.env` file.