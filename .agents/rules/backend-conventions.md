# Backend Coding Conventions

Language- and framework-agnostic. When the language or framework imposes a stricter rule, follow that first; then these conventions; then module-level agreement.

---

## Naming

| Target                               | Convention                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Folders                              | `kebab-case`                                                                         |
| Files                                | `kebab-case` + suffix: `user.service.ts`, `create-user.dto.ts`                       |
| Classes / types / interfaces / enums | `PascalCase`                                                                         |
| Functions / methods                  | `camelCase`; start with a verb: `createUser`, `getUserById`                          |
| Variables                            | Descriptive noun: `activeUsers`, `totalAmount` — never `x`, `data`, `result`, `temp` |
| Booleans                             | Prefix `is`, `has`, `can`, `should`, `must`, `allow`: `isActive`, `hasPermission`    |
| Constants                            | `UPPER_SNAKE_CASE`: `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`                           |

Generic function names (`handle`, `process`, `execute`, `run`) are only acceptable inside a clearly-named handler or job class.

---

## File size

- **500-line maximum per file.** Files exceeding this must be split.
- Split signals: multiple unrelated logic groups, a service with too many use cases, a repository mixing query types, a controller holding business logic, or an unreadably large test file.
- Splitting pattern — services: `user.service.ts` → `user-profile.service.ts`, `user-permission.service.ts`. Repositories: `user-query.repository.ts`, `user-command.repository.ts`. Validators: `create-user.validator.ts`, `update-user.validator.ts`.
- The parent module only imports and wires sub-components; it contains no business logic.

---

## Directory structure

Organise by **modules/feature first**, not by technical layer.

```

```

├── .compodoc/
├── .github/
│ └── workflows
│ └── cicd.yml
├── .husky/
├── .vscode/
├── docs/
├── logs/
├── node_modules/
├── infrastructure/
├── src/
│ ├── common/
│ │ ├── constants/
│ │ ├── decorators/
│ │ ├── filters/
│ │ ├── helper/
│ │ ├── interceptors/
│ │ ├── pipes/
│ │ ├── types/
│ │ ├── interceptors/
│ │ └── utils/
│ ├── configs/
│ │ ├── app.config.ts
│ │ └── app.config.validator.ts
│ ├── databases/
│ │ ├── constants/
│ │ ├── migrations/
│ │ ├── seeds/
│ │ ├── transformers/
│ │ ├── data-source.ts
│ │ ├── database.module.ts
│ │ └── seed.ts
│ ├── events/
│ │ └── event.gateway.ts
│ ├── generated/
│ │ └── i18n.generated.ts
│ ├── i18n/
│ │ ├── cn/
│ │ ├── en/
│ │ └── vi/
│ ├── jobs/
│ │ └── rotate-log.job.ts
│ ├── redis/
│ │ ├── constants/
│ │ ├── redis.module.ts
│ │ └── redis.service.ts
│ ├── modules/
│ │ ├── auth/
│ │ ├── users/
│ │ ├── rfid/
│ │ └── ...
│ ├── app.module.ts
│ ├── app.controller.ts
│ ├── main.ts
│ └── ...
├── test/
├── .env.example
├── commitlint.config.js
├── docker-compose.yaml
├── Dockerfile
├── ecosystem.config.js
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── sonar-project.properties
├── tsconfig.build.json
├── tsconfig.json
├── rspack.config.js
└── ...

```

```

`shared/` — add code here only when at least two modules use it and the logic is genuinely generic.  
`infrastructure/` — no business logic here; only integration with external systems.

---

## Layer responsibilities

| Layer            | Owns                                                                             | Must NOT                                                               |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Controller**   | Parse request → call service → return response                                   | Contain business logic, query DB directly, call multiple repositories  |
| **Service**      | Business logic, use-case orchestration, transaction management at use-case level | Know HTTP details, return framework-HTTP objects, embed raw SQL        |
| **Repository**   | DB queries (insert / update / delete / select), ORM encapsulation                | Enforce business rules, call external APIs, format HTTP responses      |
| **DTO / Schema** | Define input/output shape at a boundary                                          | Contain business logic                                                 |
| **Validator**    | Check required fields, types, formats, lengths, ranges, enum values              | Enforce complex business rules (those belong in service/domain policy) |
| **Mapper**       | Convert data between layers (entity ↔ DTO ↔ persistence model)                   | Call DB or external services                                           |
| **Module**       | Declare and wire dependencies; export public services                            | Contain business logic                                                 |

---

## SOLID (summary)

- **SRP** — one reason to change per class/function. Split `UserService` into `UserEmailService`, `UserBillingService`, etc. when responsibilities diverge.
- **OCP** — extend via Strategy, Policy, Factory, or interface rather than modifying stable logic.
- **LSP** — subclasses/implementations must honour the contract of the parent/interface without surprising callers.
- **ISP** — split large interfaces by usage need (`ReadableRepository`, `WritableRepository`).
- **DIP** — depend on abstractions for important or volatile dependencies: `PaymentService → PaymentGateway interface → StripePaymentGateway`.

---

## Functions

- Target: **≤ 30 lines**. Up to 60 lines if logic is linear and clear. Above 60 requires review.
- **≤ 3 parameters** preferred. 4+ parameters: group into an object/DTO.
- **Early return** to avoid nested conditions — validate/guard at the top, then run the happy path.
- **No magic numbers/strings** — extract to named constants, enums, or config.

---

## Error handling

- Classify errors: validation, auth, not-found, conflict, business-rule, external-service, infrastructure, unknown.
- Never swallow errors silently. If intentionally ignoring, add a comment and/or log.
- Client-facing error messages: short, clear, no stack trace, no secrets or internal paths.
- Internal logs may be verbose but must still exclude sensitive data.

---

## Logging

Log: important requests, unexpected errors, external API failures, retry failures, background job failures, security events, critical transactions.

Never log: passwords, access/refresh tokens, secret keys, private keys, full payment data, unnecessary PII.

| Level   | When                               |
| ------- | ---------------------------------- |
| `debug` | Development-only diagnostic info   |
| `info`  | Normal but significant events      |
| `warn`  | Abnormal but recoverable situation |
| `error` | Error requiring investigation      |
| `fatal` | System cannot continue             |

---

## Configuration

- No environment-specific values hardcoded in source (DB URL, API keys, secrets, token TTL, queue names, cache TTL, endpoints).
- Validate all required config at **startup**. Fail fast if missing — do not run in an undefined state.

---

## Database

- All schema changes go through **migrations**. No manual production DB edits without a corresponding migration.
- Complex or reporting queries belong in a named repository, not inside a service.
- **Transaction scope is the use case/service layer.** Do not scatter transaction logic across multiple repositories without clear coordination.

---

## API

- Uniform response envelope across the entire system:
   ```json
   { "data": {}, "meta": {}, "error": null }
   { "data": null, "meta": {}, "error": { "code": "USER_NOT_FOUND", "message": "User not found" } }
   ```
- All list endpoints must support **pagination** (`page`, `limit`, `total`, `totalPages`, `hasNextPage`). Use cursor-based pagination when appropriate.
- Public APIs or APIs with multiple dependents need explicit **versioning** (`/api/v1/`, `/api/v2/`).

---

## Tests

Write tests for: business logic, service use cases, complex validators, important mappers, complex repository queries, previously-found bugs, permission/auth rules, payment/order/security flows.

Test types: unit, integration, contract, e2e — choose what fits the project.

- File names: `kebab-case` with `.spec` or `.test` suffix — `user.service.spec.ts`, `payment-flow.e2e-spec.ts`.
- Structure: **Given / When / Then**.
- Each test must be **independent** — no reliance on execution order.
- Mock external dependencies (external APIs, email, payment gateway, queue, time); do not over-mock to the point the test no longer reflects real behaviour.

---

## Imports & dependencies

- Direction: `controller → service → repository → database`. No reverse imports.
- **No circular dependencies.** If one appears, revisit the design and extract a shared abstraction.
- Each module exposes only its public surface. Do not reach into internal files of another module.
- **Use path aliases, not relative traversal.** Correct: `@/modules/user/user.service`. Wrong: `../../../modules/user/user.service`. Configure `@/` (or equivalent) in `tsconfig.json` / `paths`.

---

## Security

- **Validate all external input**: request body, query params, path params, headers, queue payloads, webhook payloads, file uploads, untrusted external API responses.
- **Authorise every action**, not just authenticate. Being logged in ≠ having permission on a specific resource.
- **Never commit secrets** to source code. Secrets must not appear in code, test fixtures, logs, public docs, or error responses.
- Mask or omit sensitive fields (`password`, `token`, `apiKey`, `creditCardNumber`) in all logs and responses.

---

## Comments

- Comment **why**, not **what**. If the code is self-explanatory, no comment needed.
- TODOs must include context: `TODO: Replace in-memory cache with Redis before enabling multi-instance deployment.`

---

## Tooling & CI

Each project should enforce: formatter, linter, type checker, test runner, coverage, pre-commit hook, CI pipeline.

A pull request must not be merged if lint, format, type check, or tests fail, or if any file exceeds 500 lines without justification.

---

## Mandatory rules (summary)

1. Folders and files use `kebab-case`.
2. One file ≤ 500 lines; split when exceeded.
3. Directory structure reflects feature hierarchy (module-first).
4. Controller has no business logic.
5. Service owns business logic and use-case orchestration.
6. Repository handles data access only.
7. Follow SOLID.
8. Write tests for important logic.
9. No hardcoded config or secrets.
10.   No sensitive data in logs.
11.   No circular dependencies.
12.   PR must pass lint, format, type check, and tests before merge.

---

## Exceptions

Conventions may be broken when: the framework enforces a different name, files are auto-generated (migrations, scaffolding), or performance-critical code has been benchmarked. Document the reason in the PR or as a code comment.
