# WellOra Hospital Backend

Production-oriented REST API for the WellOra Hospital Management Platform. The
backend provides authentication, role-based access control, doctor onboarding,
schedule management, appointments, bKash payments, prescriptions, reviews,
departments, analytics, email notifications, and file storage.

## Technology Stack

- Node.js 20+
- Express 5
- TypeScript
- Prisma 7
- PostgreSQL
- Redis
- JWT and Google OAuth
- bKash Tokenized Checkout
- Cloudinary
- Nodemailer
- Zod

## Prerequisites

- Node.js 20 or later
- PostgreSQL 14 or later
- Redis
- Cloudinary account
- SMTP account
- bKash merchant credentials for payment features

## Installation

```bash
npm install
copy .env.example .env
```

Configure the required values in `.env`, then generate the Prisma Client:

```bash
npx prisma generate
```

### Database setup

For a new development database:

```bash
npx prisma migrate dev
```

If the database already contains tables created outside the current migration
history, do not run `prisma migrate reset`. Back up the database first, review
the schema drift, and use the appropriate migration or push workflow:

```bash
npx prisma migrate status
npx prisma db push
npx prisma generate
```

Never use `prisma migrate reset` on a shared or production database.

## Running the Application

```bash
npm run dev       # Development server with hot reload
npm run build     # Type-check and compile TypeScript
npm start         # Start the compiled application
```

### Deploying to Vercel

This repository exposes the Express application through the Vercel Node.js
Function at `api/index.ts`. The included `vercel.json` routes all application
requests to that function and configures the unverified-doctor cleanup as a
Vercel Cron Job.

1. Import the GitHub repository into Vercel.
2. Keep the project root set to the repository root.
3. Add every required environment variable from the table below to the
   Production environment.
4. Add `CRON_SECRET` and redeploy.

Set the Vercel project Node.js runtime to 24.x, matching `package.json`.

Vercel uses:

```text
Install Command: npm install
Build Command: npm run build
```

The deployed API is available at:

```text
https://your-project.vercel.app/api/v1
```

Do not rely on `node-cron` for Vercel execution. Vercel invokes
`/api/cron/delete-unverified-doctors` every ten minutes. The endpoint accepts
Vercel's cron authorization header when `CRON_SECRET` is configured.

The default health endpoints are:

```text
GET /
GET /test
```

## Environment Configuration

The complete configuration is mapped in `src/app/config/index.ts`.

| Variable group | Variables |
| --- | --- |
| Application | `NODE_ENV`, `PORT`, `BACKEND_URL`, `FRONTEND_URL` |
| Database | `DATABASE_URL` |
| JWT | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` |
| Security | `BCRYPT_SALT_ROUNDS` |
| OAuth | `GOOGLE_CLIENT_ID` |
| Redis | `REDIS_USER`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_TLS` |
| SMTP | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_SENDER` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| bKash | `BKASH_BASE_URL`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_CALLBACK_URL` |
| Seed accounts | `SUPER_ADMIN_*`, `TESTER_ADMIN_*`, `TESTER_DOCTOR_*` |

Do not commit `.env` files or credentials.

## API Overview

Base URL:

```text
http://localhost:5000/api/v1
```

### Authentication

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/auth/register` | Public |
| `POST` | `/auth/verify-email` | Public |
| `POST` | `/auth/login` | Public |
| `POST` | `/auth/google` | Public |
| `POST` | `/auth/refresh-token` | Public |
| `GET` | `/auth/me` | Authenticated |
| `POST` | `/auth/forgot-password` | Public |
| `POST` | `/auth/reset-password` | Public |

### Users and doctors

| Method | Endpoint | Access |
| --- | --- | --- |
| `PATCH` | `/user/profile-image` | Authenticated |
| `POST` | `/doctor/apply-as-doctor` | Public |
| `POST` | `/doctor/apply-as-doctor/verify-email` | Public |
| `POST` | `/doctor/approve-doctor` | Admin |
| `GET` | `/doctor/all-doctors` | Admin |
| `PATCH` | `/doctor/update-my-profile` | Doctor |
| `GET` | `/doctor/public/available-today` | Public |
| `GET` | `/doctor/public/all-doctors` | Public |
| `GET` | `/doctor/public/:doctorId` | Public |

Doctor applications support multipart uploads for a resume and additional
documents.

### Departments

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/department` | Public |
| `POST` | `/department` | Admin |
| `PATCH` | `/department/:departmentId` | Admin |
| `DELETE` | `/department/:departmentId` | Admin |

### Schedules and appointments

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/schedule/create-schedule` | Doctor |
| `GET` | `/schedule/my-schedules` | Doctor |
| `PATCH` | `/schedule/:scheduleId` | Doctor |
| `PATCH` | `/schedule/publish/:scheduleId` | Doctor |
| `DELETE` | `/schedule/:scheduleId` | Doctor |
| `POST` | `/appointment/book-appointment` | Patient |
| `POST` | `/appointment/pay-appointment` | Patient |
| `GET` | `/appointment/book-appointment/payment/callback` | bKash |
| `POST` | `/appointment/cancel-appointment` | Patient/Admin |
| `PATCH` | `/appointment/update-status/:appointmentId` | Doctor |
| `GET` | `/appointment/my-appointments` | Patient |
| `GET` | `/appointment/doctor-appointments` | Doctor |
| `GET` | `/appointment/all-appointments` | Admin |
| `GET` | `/appointment/:appointmentId` | Authenticated |

Appointments support `ONLINE` and `IN_PERSON` types.

### Payments

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/payment/my-payments` | Patient |
| `GET` | `/payment/all-payments` | Admin |
| `GET` | `/payment/:paymentId` | Patient/Admin |

The current payment integration uses bKash Tokenized Checkout.

### Prescriptions and reviews

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/prescription/create-prescription` | Doctor |
| `GET` | `/prescription/:appointmentId` | Patient/Doctor/Admin |
| `POST` | `/review` | Patient |
| `GET` | `/review/doctor/:doctorId` | Public |

Reviews can only be created for completed appointments. Prescriptions are
stored as structured data and also published as PDF files through Cloudinary.

### Analytics

Analytics endpoints are available under `/analytics` for administrator,
patient, and doctor dashboards according to route-level authorization.

## Response Contract

Successful responses use this envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource retrieved successfully",
  "data": {},
  "meta": {}
}
```

Errors use the same top-level status fields:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error"
}
```

Access tokens are accepted through the `accessToken` cookie or an
`Authorization: Bearer <token>` header.

## Data Model

The Prisma schema is split across `prisma/schema/` and includes:

- Users, patients, and doctors
- Departments and doctor assignments
- Doctor schedules and appointments
- Payments and bKash transaction metadata
- Structured prescriptions and generated PDF references
- Patient reviews and doctor ratings

After schema changes, always run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npx tsc --noEmit
```

## Project Structure

```text
src/
├── app.ts                         # Express application and route registration
├── server.ts                      # Database, Redis, mailer, seed, and startup
├── generated/prisma/              # Generated Prisma Client
└── app/
    ├── config/                    # Environment configuration
    ├── lib/                       # Prisma, Redis, bKash, mail, storage utilities
    ├── middleware/               # Auth, validation, error, and 404 middleware
    ├── module/                   # Feature modules
    │   ├── analytics/
    │   ├── appointment/
    │   ├── auth/
    │   ├── department/
    │   ├── doctor/
    │   ├── payments/
    │   ├── prescription/
    │   ├── review/
    │   ├── schedule/
    │   └── user/
    ├── templates/                # EJS email templates
    └── utils/                    # JWT, errors, responses, and seed helpers
prisma/
├── schema/                       # Prisma schema modules
└── migrations/                   # Migration history
```

## Quality Checks

```bash
npm run format:check
npm run lint:check
npx tsc --noEmit
```

The test script is currently a placeholder. Add automated API and integration
tests before treating the service as production-certified.
