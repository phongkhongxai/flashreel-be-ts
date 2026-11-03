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

Prisma has a datasource but deliberately contains no business models or migrations. Analyze the actual database schema before adding models; do not run migrations against existing data until their effects have been reviewed.

## Architecture

Authentication migration includes registration, login, Google OAuth, email
verification, user profiles, roles, introspection, refresh and logout.
Login and refresh return
`result.accessToken` and `result.refreshToken`. Refresh accepts
`{ "refreshToken": "..." }`. Logout accepts `accessToken` and/or
`refreshToken` and revokes the supplied tokens. Clients must retain and
send both tokens on logout to revoke both. This differs from the Java API.
Email recovery endpoints accept JSON:

- `POST /auth/resend-code`: `{ "email": "user@example.com" }` resends the verification code.
- `POST /auth/forgot-password`: `{ "email": "user@example.com" }` sends a password reset code.
- `POST /auth/reset-password`: `{ "email": "user@example.com", "code": "123456", "newPassword": "..." }` consumes the reset code and changes the password.

Codes expire after 10 minutes. Code requests are limited to one per email per minute,
and reset attempts to five per 10 minutes. Request responses are the same for
existing and unknown accounts. SMTP delivery is asynchronous; failures appear in
server logs. A password reset does not revoke existing access or refresh tokens.
Existing JWTs from Java do not contain the required token type claim and
cannot be used by these token methods. Set the `MAIL_*`, `GOOGLE_*`,
and `MINIO_PUBLIC_URL` variables before exercising those integrations.
Like the Java service, email is sent asynchronously; a delivery failure is
logged and does not roll back registration.

`config` validates environment settings at startup. `common` contains shared HTTP handling. Infrastructure modules expose injectable Prisma, Redis, and S3 clients.

The `MINIO_*` environment variables configure the existing MinIO S3 client against RustFS; the names are retained for compatibility. RustFS uses a separate volume and does not automatically import data from a MinIO volume.

The Java account, comment and follow domains are not migrated yet. The authentication migration has not yet been verified end-to-end against the original database and external services; review compatibility before replacing the Java backend.

The video module uses `FFMPEG_PATH` (default `ffmpeg`) to extract a thumbnail.
Install FFmpeg and configure `MINIO_PUBLIC_URL` and an existing storage bucket.
Keep the bucket private. Video and thumbnail responses use signed GET URLs
valid for 15 minutes; the client must request a new response after expiry.
`MINIO_PUBLIC_URL` must be the HTTP(S) origin of the S3 API, without a path,
and its hostname and port must be reachable by the client. Signatures include
the host, so use a client-accessible hostname rather than rewriting a signed
URL. A URL already issued can still be used until expiry after a take-down.
Java currently supplies a fixed five-second duration rather than probing the
uploaded video; the migrated flow retains that behavior. Video APIs have not
yet been verified end-to-end against the existing Java database and storage.
Video like, follow and comment APIs are outside this migration's scope.
