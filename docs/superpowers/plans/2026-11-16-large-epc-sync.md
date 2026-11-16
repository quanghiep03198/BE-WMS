# Large EPC Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. This is a draft: confirm the assumptions below before implementing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the two finished-goods EPC stages for large MSSQL datasets and measure their actual throughput against an isolated MongoDB target.

**Architecture:** Keep the existing mapping and eligibility rules, stream explicitly selected SQL columns into a bounded queue, and process batches with configurable concurrent MongoDB writes. Keep both stages distinct because the EPC stage depends on the match stage and on MongoDB reference collections. Start with a full, idempotent rerun rather than claiming incremental synchronization or a durable checkpoint.

**Tech Stack:** Bun, TypeScript, `mssql`, Mongoose MongoDB driver, Jest, MongoDB 4.2+.

**Spec:** User request in this conversation, 2026-11-16. No separate approved design document exists.

## Global Constraints

- Never issue SQL Server writes. Benchmark through a dedicated entry point, not the general warehouse runner, which has a SQL `DELETE` step.
- Use a read-only SQL login and verify its permissions independently; `SELECT` can still load production, so obtain permission and use a representative bounded test source.
- Use MongoDB local or a separately authorized target database and isolated, explicitly named collections. Never drop or reset shared collections.
- No `SELECT *`, including CTEs; select only needed columns.
- CLI configures connections, concurrency, batch size and chunk size; do not load the project's `.env`. Never log credentials.
- Default concurrency 4; accept 1, 2, 4 and 8. Default batch size 1000; support 1000–5000.
- Log chunk number, rows read, rows written, elapsed time and error count. A failed or partial write must produce a non-zero exit.
- Preserve existing mapping, reference fallback, match-missing handling, existing document fields and creation timestamps unless explicitly changed by an approved design.
- Proposed safe default for dirty values: preserve existing validation and fail visibly; no silent coercion or skipping.
- Proposed scope: full rerunnable sync only; incremental changes, deletions and durable resume checkpoints are not yet specified.
- Unordered upserts are the default. Do not force write concern to `w: 1`; use deployment defaults.
- Pure insert is an explicit initial-load mode only, after validating an empty exclusive destination; interrupted runs restart in upsert mode, not blind insert mode.

## Review Focus

1. Duplicate normalized EPCs across chunks: fail deterministically; never race two writes for the same key.
2. Partial unordered MongoDB failures: identify failed rows, stop intake and do not report the chunk successful.
3. Worker completion out of order or cancellation: bound in-flight data, await all started writes and close the MSSQL request.
4. Existing destination records: preserve `_id`, `created_at`, `scannable`, `deleted` and other fields currently preserved.
5. Missing match, unknown reference or invalid source field: retain the existing warning/fallback/fail semantics and expose counts.

## Current Evidence and Design Choices

- `migrations/helpers/mssql-stream.ts` already exposes a Node readable via async iteration. Awaiting a full flush naturally applies backpressure, but the EPC stage's global `seen` set grows with all EPCs.
- `migrations/commands/run-epc-match-step.ts` writes ordered batches serially. `finished-goods-epcs.ts` writes staging data, runs enrichment twice and keeps an unbounded EPC set.
- The EPC SQL currently contains `SELECT *` in ranked CTEs. Its ranking lacks a stable tie-breaker when scan times are equal; source keys and intended tie semantics must be established before changing that behavior.
- The EPC stage shares a fixed staging collection and explicitly disallows concurrent instances. Concurrent *batch workers within one guarded run* are a different problem.
- Alternatives: (1) one SQL stream plus a bounded MongoDB work queue, recommended as the least disruptive starting point; (2) multiple SQL partition readers, potentially faster but requiring a proven immutable indexed partition key and increasing SQL load; (3) retain serial processing and tune indexes first, simpler but without overlapping MongoDB latency. Benchmark (1) against baseline before adopting (2).
- MSSQL is not listening locally on `127.0.0.1:1433`. A representative authorized source is required for a real end-to-end benchmark.
- Existing EPC unit and local-Mongo integration tests: 3 suites and 21 tests passed on 2026-11-16; their mocked SQL streams are not a throughput benchmark.

## File Map

- Modify `migrations/commands/run-epc-match-step.ts`: bounded batch submission and existing match mapping.
- Modify `migrations/commands/finished-goods-epcs.ts`: explicit SQL projection, bounded duplicate detection and EPC enrichment.
- Create `migrations/helpers/epc-batch-queue.ts`: bounded concurrent batch execution, failure propagation and draining.
- Create `migrations/commands/epc-sync-args.ts` and `migrations/epc-sync.ts`: dedicated safe CLI and connection setup; no project dotenv import.
- Create `migrations/commands/benchmark-epc-sync.ts`: controlled benchmark orchestration and measurements.
- Modify `migrations/specs/finished-goods-epcs.spec.ts` and `migrations/specs/finished-goods-epcs.integration.spec.ts`; create queue, CLI and benchmark specs under `migrations/specs/`.
- Modify `migrations/specs/run-epc-match-step.integration.spec.ts` and `migrations/README.md`.

### Task 1: Safe standalone configuration

**Files:** Create `migrations/commands/epc-sync-args.ts`, `migrations/epc-sync.ts`, `migrations/specs/epc-sync-args.spec.ts`; modify `migrations/README.md`.

**Interfaces:** Produce `parseEpcSyncArgs(argv: string[]): EpcSyncOptions`, with explicit SQL and Mongo connection settings, `concurrency`, `batchSize`, `chunkSize`, stage, write mode and distinct destination names. The CLI must reject missing destination names and never import `migrations/libs/mssql.ts`, which imports project dotenv.

- [ ] Add argument tests: defaults concurrency 4 and batch size 1000; reject zero, noninteger, batch size outside 1000–5000, missing connections, unsafe or identical destination names, and duplicate flags. `--help` must not connect.
- [ ] Run `pnpm exec jest --runInBand migrations/specs/epc-sync-args.spec.ts`; expect failing tests before implementation.
- [ ] Implement parser and standalone CLI with explicit connection options; accept secrets through an explicitly named separate config file or standard input rather than logging them. Never use `migrations/run.ts`.
- [ ] Run the argument tests and `bun run migrations/epc-sync.ts --help`; expect all tests passing and help without a database connection.
- [ ] Document options, read-only SQL permission, target isolation, no implicit project `.env`, and failure exit status.

### Task 2: Bounded queue and failure handling

**Files:** Create `migrations/helpers/epc-batch-queue.ts`, `migrations/specs/epc-batch-queue.spec.ts`.

**Interfaces:** Produce `createEpcBatchQueue<T>(concurrency: number, run: (batch: T[]) => Promise<void>): { submit(batch: T[]): Promise<void>; close(): Promise<void> }`. `submit` waits when the queue has `concurrency` in-flight batches; `close` drains or rejects with the first failure after all started work settles.

- [ ] Add tests with deferred promises asserting max active jobs 1, 2 and 4; an additional submission waits until a job finishes; `close` waits for out-of-order work; a rejection stops further intake and is surfaced after draining.
- [ ] Run `pnpm exec jest --runInBand migrations/specs/epc-batch-queue.spec.ts`; expect failure before implementation.
- [ ] Implement the queue without unbounded pending batches and without swallowing errors; bound buffered input to at most one producer batch plus the configured active batches.
- [ ] Rerun the queue spec; expect all tests passing.

### Task 3: Match synchronization

**Files:** Modify `migrations/commands/run-epc-match-step.ts`, `migrations/specs/run-epc-match-step.integration.spec.ts`; add `migrations/specs/run-epc-match-step.spec.ts`.

**Interfaces:** Extend `runEpcMatchStep(pool, database, options?)` with `concurrency`, `batchSize`, `chunkSize`, target collection and write mode, preserving old defaults and return shape for existing callers. Consume Task 2 queue.

- [ ] Add tests for source trimming and invalid required fields; duplicates across different chunks; rerun preserving `_id` and `created_at`; unordered partial failure; insert mode rejecting a non-empty target. A changed `mo_no` for an existing EPC must fail under the proposed preservation policy.
- [ ] Run targeted Jest match specs; confirm new tests fail first.
- [ ] Implement bounded submission with `bulkWrite(..., { ordered: false })` and a unique EPC index. Enforce duplicate detection across the complete run in a run-isolated, uniquely indexed MongoDB staging collection rather than an unbounded in-memory set; do not treat duplicate-key failures as success. Keep MO filtering and output mapping unchanged.
- [ ] Run match unit and local MongoDB integration specs with `WAREHOUSE_SYNC_TEST_MONGO_URI` pointing at local MongoDB; expect all passing and all test databases isolated.

### Task 4: Finished-goods EPC synchronization

**Files:** Modify `migrations/commands/finished-goods-epcs.ts`, `migrations/specs/finished-goods-epcs.spec.ts`, `migrations/specs/finished-goods-epcs.integration.spec.ts`.

**Interfaces:** Extend `runFinishedGoodsEpcStep(pool, database, options)` with Task 3's tuning and destination options; preserve existing fields and return shape. Its configured match source must refer to the dedicated match target.

- [ ] Add tests for no `SELECT *`; 1001+ EPCs including duplicate EPCs across batches; unmatched matches; unknown and duplicate reference codes; invalid date/text; partial MongoDB failure; existing document fields; and concurrent batch execution with bounded intake.
- [ ] Run targeted EPC specs and confirm new tests fail first.
- [ ] Replace ranked CTE `SELECT *` with their existing explicit column lists. Replace global `seen` with per-run, unique-indexed staging; use per-run staging names and an exclusive target guard so overlapping sync instances cannot race or drop one another's staging.
- [ ] Enrich each staged batch once, preserve existing field/update semantics, use unordered writes, await failures, and log source/written/error/missing/fallback counts per chunk. Keep failed-run staging for diagnosis; clean only the staging collection created by that run after successful completion.
- [ ] Run the EPC unit and local MongoDB integration specs; expect all passing, including existing behavior.

### Task 5: Real benchmark and reporting

**Files:** Create `migrations/commands/benchmark-epc-sync.ts`, `migrations/specs/benchmark-epc-sync.spec.ts`; modify `migrations/README.md`.

**Interfaces:** Produce `runEpcBenchmark(options: EpcSyncOptions): Promise<BenchmarkResult[]>`; each result includes stage, concurrency, chunk and row counts, elapsed milliseconds, successful rows/second, errors, peak RSS and target/write mode. Provide a standalone CLI command that refuses a missing or non-isolated target.

- [ ] Add tests asserting runs for 1, 2, 4 and 8, throughput calculated from successful rows and wall-clock time, no estimate on failed or zero-row runs, isolation validation, and no secret in output.
- [ ] Run `pnpm exec jest --runInBand migrations/specs/benchmark-epc-sync.spec.ts`; expect failure before implementation.
- [ ] Implement benchmark against the same representative input and equally prepared isolated destination for each concurrency. Run 1–2 *waves* of chunks with at least `concurrency` runnable chunks per wave; two total chunks cannot exercise eight workers. Benchmark match and EPC stages separately and include SQL startup, enrichment and MongoDB writes in end-to-end wall time.
- [ ] Run unit and integration tests plus a real MSSQL-to-local/isolated-Mongo benchmark at concurrency 1, 2, 4 and 8. Record dataset, both stage results, rows, elapsed time, errors, peak RSS, source and destination topology, and initial-load versus rerun mode.
- [ ] Report the first concurrency after which throughput improves less than 10% relative to the preceding setting, or state that no plateau was observed. Estimate `20,000,000 / successful rows per second` separately for each stage, disclose that a 1–2-wave sample is provisional, and do not present this estimate if errors or missing representative input invalidate the run.
- [ ] Run `pnpm test:migrations` and `pnpm typecheck`; report the exact outcomes and any skipped integration tests. Apply verification-before-completion before claiming the benchmark or implementation is complete.

## Decisions To Confirm Before Implementation

1. Are existing strict dirty-value validation and fail-fast behavior acceptable, or which exact source values should be normalized or quarantined?
2. Is an idempotent full rerun sufficient, or are incremental updates, source deletions and durable resume required?
3. Supply an authorized representative SQL read-only source and isolated MongoDB target; agree on acceptable load and repeatable source selection.
4. Confirm whether an EPC whose source MO changes must fail as today or update the existing document.
5. Confirm SQL scan tie-break fields and intended winner before promising deterministic ranking.
