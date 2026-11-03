# Flashreel NestJS foundation
 
This is the existing NestJS project, prepared for incremental migration from the Java backend. It contains no migrated business APIs or database models.

## Repositories

| Component | Repository |
|-----------|------------|
| 🖥 Backend | https://github.com/phongkhongxai/flashreel-be-ts |
| 🌐 Frontend | https://github.com/phongkhongxai/flashreel-fe |
| 📱 Android app | https://github.com/phongkhongxai/flashreel-android |

## Requirements

- Node.js 24 LTS and npm
- MySQL and Redis reachable from the application
- An S3-compatible storage server and an existing bucket for future storage operations

## Local infrastructure with Docker Compose

The standalone Compose file runs only MySQL, Redis, and RustFS. It is independent
of the Java Compose project and does not run either backend. From this directory:

```powershell
Copy-Item .env.example .env # Only if .env does not already exist
# Edit .env and replace the sample credentials.
docker compose up -d
docker compose ps
```

For an existing `.env`, add the Compose variables shown in `.env.example`.
`DATABASE_URL` must use the same MySQL username, password, database, and host
port configured for the container. Compose passes `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` to RustFS. Encode
special characters in the database URL. If you change `REDIS_PORT` or
`MINIO_PORT`, update the NestJS connection settings as well. Sample
credentials are for local development only.

The default host ports are MySQL 3307, Redis 6379, RustFS S3 API 9000, and RustFS
console 9001. The Java Compose project uses the same ports, so stop its
containers or select different host ports before running both. This project
has separate named volumes and does not automatically reuse Java data.
Existing MySQL volumes retain their original credentials and database if
environment variables change. `docker compose down` retains volumes;
`docker compose down -v` deletes them.

Start NestJS separately using the commands below. The S3 client does not
create or check its bucket; create the configured bucket before storage use.

Copy `.env.example` to `.env` and replace every placeholder with your own values. URL-encode special characters in database credentials. Restrict `CORS_ORIGINS` to a comma-separated list of trusted origins when appropriate; `*` allows all origins without credentials. JWT expiry is in seconds.

```sh
npm ci
npx prisma generate
npm run start:dev
```

The application listens on port 8080 by default. `GET /health` is a process liveness endpoint, not a dependency readiness check. Swagger UI is at `/docs`. Routes have no global prefix, matching the Java service. MySQL and Redis must be reachable at startup; the S3 client is configured without creating or checking buckets. Shutdown hooks close database and Redis connections.

```sh
npm run build
npm run lint
npm test
```

## Architecture

Flashreel Backend is built with NestJS and organized by feature and infrastructure:

- **Auth:** registration, login, Google OAuth, email verification, password recovery and JWT sessions.
- **Users:** profiles, avatars and follow relationships.
- **Videos:** uploads, feeds, playback, moderation and interaction counters.
- **Interactions:** likes, comments and view tracking.
- **Account:** account cancellation.
- **Infrastructure:** MySQL through Prisma, Redis, SMTP email and S3-compatible object storage.

### Authentication

Authentication uses separate access and refresh tokens:

- Login and refresh return `result.accessToken` and `result.refreshToken`.
- Send the access token in the `Authorization: Bearer <accessToken>` header.
- Refresh with `POST /auth/refresh` and body `{ "refreshToken": "..." }`.
- Refresh tokens are rotated; save both tokens returned by each successful refresh.
- Logout with `POST /auth/logout` and provide `accessToken`, `refreshToken`, or both. Send both to revoke both.

### Email verification and password recovery

The following endpoints accept JSON:

- `POST /auth/resend-code` — `{ "email": "user@example.com" }`
- `POST /auth/forgot-password` — `{ "email": "user@example.com" }`
- `POST /auth/reset-password` — `{ "email": "user@example.com", "code": "123456", "newPassword": "..." }`

Verification and password-reset codes expire after 10 minutes. Code requests are limited to one per email per minute, and password reset is limited to five attempts per 10 minutes.

Email is sent asynchronously through SMTP. Delivery failures are recorded in server logs and do not roll back registration. Password reset currently does not revoke previously issued tokens.

Configure `MAIL_*` for SMTP and `GOOGLE_*` for Google OAuth.

### Database and cache

MySQL stores application data through Prisma. Redis stores temporary authentication codes and account-cancellation confirmations.

Configuration is loaded from environment variables and validated at application startup.

### Object storage and media

RustFS provides S3-compatible object storage. The `MINIO_*` environment variables configure the S3 client and bucket.

Keep the bucket private. Video, thumbnail and internally stored avatar responses use signed GET URLs valid for 15 minutes. Clients must request a new API response after a URL expires.

`MINIO_PUBLIC_URL` must be the HTTP(S) origin of the S3 API and must be reachable from the client. The hostname and port are part of the signature, so do not rewrite a signed URL.

The video module uses FFmpeg to extract thumbnails. Install FFmpeg and set `FFMPEG_PATH` if it is not available in `PATH`. The current upload flow uses a fixed five-second duration rather than probing the actual video duration.
