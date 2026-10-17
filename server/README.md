<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Backend API for the KKFC multi-brand POS system, built with NestJS and Prisma.
Implemented modules are authentication, users, and brands.

## Project setup

```bash
$ npm install
```

## Prisma

The database layer follows the `cssweng/backend` setup: Prisma 7.8,
PostgreSQL through `PrismaPg`, and a global `PrismaModule` in
`src/shared/prisma`. Inject `PrismaService` into feature services to query
the database.

Copy `.env.example` to `.env` and replace the example database credentials,
or keep using the existing `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
and `DB_NAME` variables. `DATABASE_URL` takes precedence. Both the CLI and
server load `.env` and then `../.env`; the server also prioritizes
`.env.development` by default or `.env.production` when `NODE_ENV=production`.
Use host `db` for the API container and `localhost` when running locally.

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:studio
```

The database schema is defined in [prisma/schema.prisma](prisma/schema.prisma),
with an ERD in [docs/erd.dbml](docs/erd.dbml). Each user belongs to at most
one brand through nullable `users.brand_id`; a brand can contain many users.
There is no assignment model in the current Prisma schema. Regenerate the
client after schema changes; build and development start scripts do this
automatically. No database changes are made by generation or building.

For the same environment-specific workflow as the reference project, put
`DATABASE_URL` in `.env.development` or `.env.production` and use:

```bash
# Prototype schema changes against the development database
npm run db:push:dev

# Create and apply a development migration
npm run db:migrate:dev -- --name init

# Apply committed migrations in production (requires dev dependencies)
npx prisma migrate deploy
```

`db:push:prod` is also available to match the reference project; use
committed migrations for production schema changes. Database push and
migration commands change the configured database and are run separately.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API documentation

Swagger UI: `http://localhost:3000/api/docs` (JSON: `/api/docs-json`).
Log in through `POST /api/auth/login`, then paste the returned token into **Authorize**.
Sessions expire after 24 hours. Protected routes require `Authorization: Bearer <token>`.
Login returns `token`, `expires_at`, and a user profile with nullable `brand_id`.
Password hashes are excluded from API responses.

| Endpoint | Access and behavior |
| --- | --- |
| `POST /api/auth/login` | Active users of any role; creates a session. |
| `GET /api/auth/me` | Any authenticated user; returns their current profile. |
| `POST /api/auth/logout` | Revokes the current session; returns 204. |
| `POST /api/auth/logout-all` | Revokes all sessions for the current user; returns 204. |
| `POST /api/users` | Owners create staff in their brand. Superadmins can create any role. Staff require an active `brand_id`; owners and superadmins may be unassigned. |
| `GET /api/users` | Owners list users in their brand. Superadmins list users across all brands. |
| `GET /api/users/:id` | Accepts username or user ID. Owners can read themselves and users in their brand; superadmins can read across brands. |
| `PATCH /api/users/:id` | Requires a user UUID. Owners edit themselves or staff in their brand; they cannot edit another owner/superadmin or reset another user's password. Superadmins can edit any active user. |
| `DELETE /api/users/:id` | Requires a user UUID. Owners deactivate themselves; superadmins can deactivate any active user. |
| `POST /api/brands` | Owners create a brand for themselves. Superadmins must provide `owner_id` for an active owner without a brand. `code` is required and supplied by the client, with one to four characters. |
| `GET /api/brands` | Superadmins only; lists all brands. |
| `GET /api/brands/:brandId` | Any authenticated user can read their assigned brand; superadmins can read any active brand. |
| `PATCH /api/brands/:brandId` | Owners update their brand; superadmins can update any active brand. `code` is optional and is not generated on rename. |
| `DELETE /api/brands/:brandId` | Owners deactivate their brand; superadmins can deactivate any active brand. The brand and its active users are deactivated together. |

Listings accept `page` (default 1), `limit` (default 10, maximum 100), and
`activeOnly` (default true). `activeOnly=false` includes both active and inactive
records. Listings return `{ data, meta: { page, limit, total, totalPages } }`.
The single-user lookup also accepts `activeOnly`; the single-brand lookup
returns active brands only. User UUIDs take priority over usernames for profile
searches. Session validation and user update/delete operations use strict user-ID lookups.

Brand codes are unique and manually supplied. Setting `logo_url` to null clears
the logo on update; omitted update fields keep their existing values. The old
brand-assignment endpoints have been removed. A user is linked directly to a
brand through `brand_id` during user creation or the brand's owner-linking transaction.

## Run tests

```bash
# all tests
$ npm test

# service tests
$ npm run test:unit

# HTTP endpoint tests
$ npm run test:integration

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
