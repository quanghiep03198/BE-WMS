# Kế hoạch triển khai tạm dừng queue khi MSSQL gián đoạn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi máy chủ hoặc database MSSQL không khả dụng, các queue BullMQ ghi vào MSSQL tự tạm dừng, job đang chạy quay lại hàng đợi mà không mất lượt retry, và queue tự chạy lại khi kết nối bình thường; lỗi lập trình hoặc lỗi dữ liệu không được retry.

**Architecture:** Thêm thư mục `src/databases/mssql-availability/` gồm ba phần: hàm thuần phân loại lỗi; `MssqlCircuitService` giữ trạng thái "mạch" trong Redis, pause/resume queue và chạy vòng probe; `MssqlQueueGuard.run()` bọc phần xử lý của consumer. Trạng thái nằm trong Redis nên dùng chung cho mọi instance và còn nguyên sau khi restart.

**Tech Stack:** NestJS 11, BullMQ 5.81 (`Queue.pause/resume/isPaused`, `Job.moveToWait`, `WaitingError`, `UnrecoverableError`), ioredis, TypeORM 0.3 + mssql 12, prom-client, Jest, pnpm.

**Spec:** Không có tài liệu thiết kế riêng. Kế hoạch triển khai các phương án khuyến nghị 1–4 và phần idempotency đã nêu trong phiên này; các quyết định thiết kế nằm ở mục "Thiết kế đã chốt".

## Global Constraints

- Không thêm dependency mới.
- TypeScript strict, không dùng `any`; tên file kebab-case, class PascalCase.
- Không ghi vào MSSQL production (`TENANT 19`, `TENANT 21`, `TENANT 80.2`, `TENANT 201.202`, `TENANT 5.1`). Mọi test trong kế hoạch dùng mock hoặc Redis local; probe chỉ đọc.
- Không sửa file migration cũ. Không thay đổi HTTP API, nên không cập nhật Postman collection.
- Không đổi `attempts`, `backoff`, `removeOnFail` của các queue hiện có. Lỗi không phân loại được vẫn retry đúng như hiện tại.
- Guard không bao giờ làm kết quả tệ hơn hiện tại: nếu bước pause hoặc trả job về hàng đợi thất bại thì ném lại lỗi gốc để BullMQ retry như cũ.
- Hằng số: `PROBE_INTERVAL_MS = 5000`, `PROBE_TIMEOUT_MS = 5000`, `REQUIRED_HEALTHY_PROBES = 3`, `MIN_OPEN_MS = 30000`, `MAX_MIN_OPEN_MS = 600000`, `FLAP_WINDOW_MS = 600000`.
- `pnpm typecheck` hiện có sẵn 1 lỗi không liên quan (`defective-goods-cache.repository.ts` thiếu `defective-goods-cache.port`). "PASS" trong kế hoạch nghĩa là không có lỗi nào khác ngoài lỗi này.
- Commit theo Conventional Commits.

## Review Focus

- Máy chủ treo, chỉ trả về request timeout chứ không có lỗi socket: queue phải được pause thay vì tiêu hết lượt retry; test ở Task 3.
- Một kết nối bị rớt đơn lẻ trong khi database vẫn khỏe: không được pause queue, job retry bình thường; test ở Task 3.
- Queue đã được người vận hành pause thủ công trước sự cố: sau khi database hồi phục vẫn phải giữ nguyên trạng thái pause; test ở Task 2.
- Ứng dụng restart giữa lúc sự cố: instance mới phải tiếp tục probe từ trạng thái trong Redis và resume queue; test ở Task 2.
- MSSQL đã commit nhưng mất phản hồi nên job chạy lại: đổi MO không được ghi đè `mo_no_actual` lần hai; test ở Task 5.

---

## Phạm vi

Queue được gate, tất cả phụ thuộc `DATA_SOURCE_DATA_LAKE`:

| Queue | Consumer |
| --- | --- |
| `COMMIT_STOCK_BALANCES_QUEUE` | `src/modules/finished-goods/infrastructure/queues/consumers/commit-stock-balances.consumer.ts` |
| `COMMIT_STOCK_OUT_QUEUE` | `.../consumers/commit-stock-out.consumer.ts` |
| `COMMIT_EXCHANGE_MO_QUEUE` | `.../consumers/commit-exchange-mo.consumer.ts` |
| `COMMIT_UPSERT_EPC_MATCH_QUEUE` | `.../consumers/commit-upsert-epcs-match.consumer.ts` |
| `ROLLBACK_STOCK_TX_QUEUE` | `.../consumers/commit-rollback-stock-tx.consumer.ts` |
| `DEFECTIVE_GOODS_SYNC_QUEUE` | `src/modules/defective-goods/infrastructure/queues/consumers/sync-defective-goods.consumer.ts` |
| `SYNC_DISPATCH_ORDER_QUEUE` | `src/modules/truckload-delivery/infrastructure/queues/consumers/sync-dispatch-order.consumer.ts` |

Không gate: `BULK_WRITE_INBOUND_EPCS_QUEUE`, `BULK_WRITE_OUTBOUND_EPCS_QUEUE`, `FILES_CLEANUP_QUEUE` (chỉ ghi MongoDB); `IMPORT_INOUTBOUND_EPCS_QUEUE` và `MANIFEST_EXPORT_QUEUE` (chỉ đọc MSSQL, người dùng đang chờ kết quả); `THIRD_PARTY_API_SYNC` (phụ thuộc API ngoài và có tiến trình hiển thị realtime).

Ngoài phạm vi, cần kế hoạch riêng: transactional outbox cho bước enqueue (các command handler hiện bắt lỗi `queue.add` rồi chỉ log, và `DefectiveGoodsSaga` gom sự kiện trong bộ nhớ); thứ tự giữa các queue khác nhau; cấu hình alert rule trong Grafana (README ở Task 4 cung cấp biểu thức PromQL).

## Thiết kế đã chốt

**Phân loại lỗi.** `driver` là `error.driverError` nếu `error` là `QueryFailedError` của TypeORM, ngược lại là chính `error`. Nhận diện theo `name` và `code` (duck typing), không dùng `instanceof` với class của `mssql`. Áp dụng theo thứ tự:

| Điều kiện | Loại |
| --- | --- |
| `error` là `TypeError`, `ReferenceError`, `RangeError`, `SyntaxError` | `permanent` |
| `driver.name` là `ConnectionError` hoặc `TransactionError` | `suspect` |
| `driver.name` là `TimeoutError` và `error` là `QueryFailedError` | `suspect` |
| `RequestError`, `code` thuộc `ETIMEOUT`, `ECANCEL`, `ENOCONN`, `ECLOSE`, `EINVALIDSTATE` | `suspect` |
| `RequestError`, `code` thuộc `EARGS`, `EINJECT`, `EPARAM`, `EDUPEPARAM`, `ENAME`, `EJSON` | `permanent` |
| `RequestError` + `EREQUEST`, `number` thuộc 921, 922, 923, 924, 927, 942, 945, 946, 948, 952, 976, 983, 1105, 3906, 4060, 4064, 6005, 9001, 9002, 17142 | `outage` |
| `RequestError` + `EREQUEST`, `number` thuộc 701, 1204, 1205, 1222, 3960, 3961, 8645, 8651 | `transient` |
| `RequestError` + `EREQUEST`, `number` thuộc 102, 105, 137, 156, 201, 207, 208, 229, 230, 241, 242, 245, 515, 2628, 2812, 8114, 8115, 8134, 8152, 13609 | `permanent` |
| Còn lại | `unknown` |

Lỗi trùng khóa 2601/2627 và lỗi ràng buộc 547 cố ý để `unknown`: `MERGE` chạy đồng thời có thể sinh 2627 tạm thời. Các danh sách số lỗi là danh sách khởi đầu, bổ sung dần từ log thực tế.

**Cách xử lý từng loại trong guard.**

| Loại | Hành động |
| --- | --- |
| `permanent` | Ném `UnrecoverableError` giữ nguyên message, `cause` là lỗi gốc. Job vào `failed` ngay, không retry. |
| `outage` | Mở mạch, pause queue, trả job về hàng đợi, ném `WaitingError`. |
| `suspect` | Probe ngay một lần. Probe thất bại thì xử lý như `outage`; probe thành công thì ném lại lỗi gốc. |
| `transient`, `unknown` | Ném lại lỗi gốc, BullMQ retry theo cấu hình hiện có. |

`Job.moveToWait(token)` đưa job về đầu hàng đợi (hoặc danh sách paused) và không tăng `attemptsMade`, nên sự cố kéo dài bao lâu cũng không làm job hết lượt.

**Trạng thái mạch trong Redis** (qua `REDIS_CLIENT`), `{ds}` là data source token:

| Key | Kiểu | Nội dung |
| --- | --- | --- |
| `mssql:circuit:open` | set | các `{ds}` đang mở mạch |
| `mssql:circuit:{ds}` | hash | `openedAt`, `reason`, `minOpenMs` |
| `mssql:circuit:{ds}:queues` | set | tên các queue do mạch pause |
| `mssql:circuit:{ds}:last` | string, `PX 600000` | `minOpenMs` của lần mở gần nhất |

Queue được pause lười: queue nào gặp lỗi thì queue đó tự pause và ghi tên vào set. Queue đang pause sẵn khi mạch mở thì không ghi vào set, nên không bị resume nhầm. Khi đóng mạch: resume các queue trong set trước, xóa trạng thái sau.

`minOpenMs` là thời gian tối thiểu giữ mạch mở trước khi probe. Bằng `30000`, hoặc gấp đôi giá trị trong `mssql:circuit:{ds}:last` nếu key này còn tồn tại, tối đa `600000`. Cơ chế này chặn vòng lặp pause/resume liên tục khi probe đọc vẫn qua nhưng ghi vẫn lỗi (ví dụ đầy transaction log).

**Probe** chạy qua chính `DataSource` của ứng dụng, chỉ đọc:

```sql
SELECT CASE WHEN DATABASEPROPERTYEX(DB_NAME(), 'Status') = 'ONLINE' AND DATABASEPROPERTYEX(DB_NAME(), 'Updateability') = 'READ_WRITE' THEN 1 ELSE 0 END AS ok
```

Khỏe khi dòng đầu có `ok === 1` trong vòng `PROBE_TIMEOUT_MS`.

**Metric:** gauge `mssql_circuit_open{data_source}` (1 khi mở, 0 khi đóng) và counter `mssql_circuit_opened_total{data_source}`.

---

### Task 1: Phân loại lỗi MSSQL

**Files:**
- Tạo: `src/databases/mssql-availability/mssql-error.classifier.ts`
- Test: `src/databases/mssql-availability/specs/mssql-error.classifier.spec.ts`

**Interfaces:**
- Sử dụng: `QueryFailedError` từ `typeorm`.
- Cung cấp: `type MssqlErrorKind = 'outage' | 'suspect' | 'transient' | 'permanent' | 'unknown'` và `classifyMssqlError(error: unknown): MssqlErrorKind`.

- [ ] **Bước 1: Viết test thất bại**

```ts
const mssqlError = (name: string, code?: string, number?: number): Error =>
	Object.assign(new Error(name), { name, code, number })
const queryFailed = (driverError: Error): QueryFailedError => new QueryFailedError('SELECT 1', [], driverError)

it.each<[string, unknown, MssqlErrorKind]>([
	['connection reset', queryFailed(mssqlError('ConnectionError', 'ESOCKET')), 'suspect'],
	['connection ended without code', mssqlError('ConnectionError'), 'suspect'],
	['request timeout', queryFailed(mssqlError('RequestError', 'ETIMEOUT')), 'suspect'],
	['transaction aborted', mssqlError('TransactionError', 'EABORT'), 'suspect'],
	['pool acquire timeout', queryFailed(mssqlError('TimeoutError')), 'suspect'],
	['database offline', queryFailed(mssqlError('RequestError', 'EREQUEST', 942)), 'outage'],
	['transaction log full', queryFailed(mssqlError('RequestError', 'EREQUEST', 9002)), 'outage'],
	['deadlock victim', queryFailed(mssqlError('RequestError', 'EREQUEST', 1205)), 'transient'],
	['snapshot update conflict', queryFailed(mssqlError('RequestError', 'EREQUEST', 3960)), 'transient'],
	['invalid object name', queryFailed(mssqlError('RequestError', 'EREQUEST', 208)), 'permanent'],
	['invalid parameter', mssqlError('RequestError', 'EARGS'), 'permanent'],
	['programming error', new TypeError("Cannot read properties of undefined (reading 'status')"), 'permanent'],
	['duplicate key from concurrent MERGE', queryFailed(mssqlError('RequestError', 'EREQUEST', 2627)), 'unknown'],
	['MongoDB network error', mssqlError('MongoNetworkError', 'ECONNRESET'), 'unknown'],
	['timeout outside TypeORM', mssqlError('TimeoutError'), 'unknown'],
	['bare socket error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), 'unknown'],
	['non-error value', 'boom', 'unknown']
])('%s -> %s', (_label, error, expected) => {
	expect(classifyMssqlError(error)).toBe(expected)
})
```

- [ ] **Bước 2: Chạy test và xác nhận thất bại**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/mssql-error.classifier.spec.ts`
Kết quả mong đợi: FAIL vì chưa có module `mssql-error.classifier`.

- [ ] **Bước 3: Viết `classifyMssqlError` theo bảng "Phân loại lỗi"**

Giữ ba danh sách số lỗi trong ba `ReadonlySet<number>` không export; so sánh bằng `Number(driver.number)`.

- [ ] **Bước 4: Chạy lại test và xác nhận qua**

Chạy lại lệnh ở Bước 2. Kết quả mong đợi: PASS, 17 trường hợp.

- [ ] **Bước 5: Commit**

```bash
git add docs/superpowers/plans/2026-11-28-mssql-outage-queue-gate.md src/databases/mssql-availability/mssql-error.classifier.ts src/databases/mssql-availability/specs/mssql-error.classifier.spec.ts
git commit -m "feat: classify mssql errors for queue retry decisions"
```

### Task 2: Mạch trạng thái, probe và pause/resume queue

**Files:**
- Tạo: `src/databases/mssql-availability/constants.ts`
- Tạo: `src/databases/mssql-availability/mssql-circuit.service.ts`
- Test: `src/databases/mssql-availability/specs/mssql-circuit.service.spec.ts`

**Interfaces:**
- Sử dụng: `ModuleRef`; `getQueueToken` từ `@nestjs/bullmq`; `getDataSourceToken` từ `@nestjs/typeorm`; `InjectRedisClient` từ `@redis/decorators`; `InjectMetric` từ `@willsoto/nestjs-prometheus`.
- Cung cấp:
  - `constants.ts`: sáu hằng số ở Global Constraints, `MSSQL_CIRCUIT_OPEN_GAUGE = 'mssql_circuit_open'`, `MSSQL_CIRCUIT_OPENED_COUNTER = 'mssql_circuit_opened_total'`, `MSSQL_PROBE_SQL`.
  - `MssqlCircuitService` với constructor `(moduleRef: ModuleRef, @InjectRedisClient() redis: Redis, @InjectMetric(MSSQL_CIRCUIT_OPEN_GAUGE) openGauge: Gauge<string>, @InjectMetric(MSSQL_CIRCUIT_OPENED_COUNTER) openedCounter: Counter<string>)` và ba method public:
    - `isHealthy(dataSourceToken: string): Promise<boolean>`
    - `open(dataSourceToken: string, queueName: string, reason: string): Promise<void>`
    - `tick(now: number = Date.now()): Promise<void>`
  - Service chỉ dùng các lệnh Redis: `hsetnx`, `hset`, `hgetall`, `sadd`, `srem`, `smembers`, `del`, `set`, `get`.

- [ ] **Bước 1: Viết test thất bại**

Viết `createHarness()` trong file spec: Redis giả trong bộ nhớ chỉ cài chín lệnh trên; hai queue giả `Q1`, `Q2` có `isPaused`, `pause`, `resume` là `jest.fn` đổi cờ nội bộ; `DataSource` giả có `query` trả `[{ ok: 1 }]` khi `db.up` là `true` và reject khi `false`; `moduleRef.get` tra theo `getQueueToken(name)` và `getDataSourceToken('DATA_LAKE')`, ném lỗi khi không tìm thấy; `gauge.set` và `counter.inc` là `jest.fn`. Harness trả `{ service, redis, moduleRef, queues, dataSource, db, gauge, counter }` và được tạo lại trong `beforeEach`; `closeAfter = Date.now() + 31_000`.

```ts
it('opens once, pauses the reporting queue and records it', async () => {
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	expect(queues.Q1.pause).toHaveBeenCalledTimes(1)
	expect(await redis.smembers('mssql:circuit:open')).toEqual(['DATA_LAKE'])
	expect(await redis.smembers('mssql:circuit:DATA_LAKE:queues')).toEqual(['Q1'])
	expect((await redis.hgetall('mssql:circuit:DATA_LAKE')).minOpenMs).toBe('30000')
	expect(counter.inc).toHaveBeenCalledTimes(1)
	expect(gauge.set).toHaveBeenLastCalledWith({ data_source: 'DATA_LAKE' }, 1)
})

it('does not resume a queue that was paused before the outage', async () => {
	await queues.Q1.pause()
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	await service.open('DATA_LAKE', 'Q2', 'ESOCKET')
	for (let i = 0; i < 3; i++) await service.tick(closeAfter)
	expect(queues.Q1.resume).not.toHaveBeenCalled()
	expect(queues.Q2.resume).toHaveBeenCalledTimes(1)
})

it('stays open during minOpenMs and until 3 consecutive healthy probes', async () => {
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	await service.tick(Date.now() + 1000)
	expect(dataSource.query).not.toHaveBeenCalled()
	await service.tick(closeAfter)
	await service.tick(closeAfter)
	db.up = false
	await service.tick(closeAfter)
	db.up = true
	await service.tick(closeAfter)
	await service.tick(closeAfter)
	expect(queues.Q1.resume).not.toHaveBeenCalled()
	await service.tick(closeAfter)
	expect(queues.Q1.resume).toHaveBeenCalledTimes(1)
	expect(await redis.smembers('mssql:circuit:open')).toEqual([])
	expect(await redis.hgetall('mssql:circuit:DATA_LAKE')).toEqual({})
	expect(gauge.set).toHaveBeenLastCalledWith({ data_source: 'DATA_LAKE' }, 0)
})

it('a new instance continues from Redis state after a restart', async () => {
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	const restarted = new MssqlCircuitService(moduleRef, redis, gauge, counter)
	for (let i = 0; i < 3; i++) await restarted.tick(closeAfter)
	expect(queues.Q1.resume).toHaveBeenCalledTimes(1)
})

it('doubles minOpenMs when reopened inside the flap window, capped at 600000', async () => {
	await service.open('DATA_LAKE', 'Q1', 'log full')
	for (let i = 0; i < 3; i++) await service.tick(closeAfter)
	await service.open('DATA_LAKE', 'Q1', 'log full')
	expect((await redis.hgetall('mssql:circuit:DATA_LAKE')).minOpenMs).toBe('60000')
	for (let i = 0; i < 3; i++) await service.tick(Date.now() + 61_000)
	await redis.set('mssql:circuit:DATA_LAKE:last', '600000', 'PX', 600000)
	await service.open('DATA_LAKE', 'Q1', 'log full')
	expect((await redis.hgetall('mssql:circuit:DATA_LAKE')).minOpenMs).toBe('600000')
})

it('resumes the remaining queues when one queue cannot be resolved', async () => {
	await service.open('DATA_LAKE', 'Q1', 'ESOCKET')
	await redis.sadd('mssql:circuit:DATA_LAKE:queues', 'MISSING')
	for (let i = 0; i < 3; i++) await service.tick(closeAfter)
	expect(queues.Q1.resume).toHaveBeenCalledTimes(1)
	expect(await redis.smembers('mssql:circuit:open')).toEqual([])
})

it('isHealthy is false when the probe rejects, reports ok=0, or exceeds 5000ms', async () => {
	db.up = false
	expect(await service.isHealthy('DATA_LAKE')).toBe(false)
	dataSource.query.mockResolvedValueOnce([{ ok: 0 }])
	expect(await service.isHealthy('DATA_LAKE')).toBe(false)
	jest.useFakeTimers()
	dataSource.query.mockReturnValueOnce(new Promise(() => undefined))
	const pending = service.isHealthy('DATA_LAKE')
	await jest.advanceTimersByTimeAsync(5000)
	expect(await pending).toBe(false)
	jest.useRealTimers()
})
```

- [ ] **Bước 2: Chạy test và xác nhận thất bại**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/mssql-circuit.service.spec.ts`
Kết quả mong đợi: FAIL vì chưa có `MssqlCircuitService`.

- [ ] **Bước 3: Viết `constants.ts` và `MssqlCircuitService`**

`open`: tính `minOpenMs` từ key `:last`; `hsetnx` trường `openedAt`; chỉ khi tạo mới mới ghi `reason`, `minOpenMs`, thêm vào `mssql:circuit:open`, tăng counter, đặt gauge 1 và log mức error. Sau đó, bất kể mạch mới hay cũ: nếu queue chưa pause thì `pause()` rồi `sadd` tên queue.

`tick`: với mỗi `{ds}` trong `mssql:circuit:open`, hash rỗng thì `srem`; chưa đủ `minOpenMs` kể từ `openedAt` thì bỏ qua; ngược lại gọi `isHealthy` và đếm chuỗi thành công trong bộ nhớ theo `{ds}`, thất bại đưa về 0. Đủ `REQUIRED_HEALTHY_PROBES` thì đóng mạch theo thứ tự: resume từng queue trong set (lỗi của một queue chỉ log, không dừng), ghi key `:last`, xóa hash và set queue, `srem`, đặt gauge 0.

Service cài `OnApplicationBootstrap` (`setInterval` gọi `tick` mỗi `PROBE_INTERVAL_MS`, có cờ chống chạy chồng, bắt lỗi và log mức warn) và `OnModuleDestroy` (`clearInterval`), theo mẫu `src/metrics/bull-gauge-discovery.service.ts`. Khi bootstrap, log mức warn cho mỗi `{ds}` đang mở mạch.

- [ ] **Bước 4: Chạy lại test và xác nhận qua**

Chạy lại lệnh ở Bước 2. Kết quả mong đợi: PASS, 7 test.

- [ ] **Bước 5: Commit**

```bash
git add src/databases/mssql-availability/constants.ts src/databases/mssql-availability/mssql-circuit.service.ts src/databases/mssql-availability/specs/mssql-circuit.service.spec.ts
git commit -m "feat: add mssql circuit with queue pause and health probe"
```

### Task 3: Guard cho consumer

**Files:**
- Tạo: `src/databases/mssql-availability/mssql-queue-guard.service.ts`
- Test: `src/databases/mssql-availability/specs/mssql-queue-guard.service.spec.ts`
- Test: `src/databases/mssql-availability/specs/mssql-queue-guard.redis.spec.ts`

**Interfaces:**
- Sử dụng: `classifyMssqlError` (Task 1); `MssqlCircuitService.isHealthy` và `.open` (Task 2); `Job`, `UnrecoverableError`, `WaitingError` từ `bullmq`.
- Cung cấp: `MssqlQueueGuard` với constructor `(circuit: MssqlCircuitService)` và `run<T>(dataSourceToken: string, job: Job, token: string | undefined, work: () => Promise<T>): Promise<T>`.

- [ ] **Bước 1: Viết unit test thất bại**

Tạo lại trong `beforeEach`: `circuit = { isHealthy: jest.fn(), open: jest.fn().mockResolvedValue(undefined) }`, `job = { id: '1', queueName: 'Q1', moveToWait: jest.fn().mockResolvedValue(0) }`, `guard = new MssqlQueueGuard(circuit as never)`. Dùng hai helper `mssqlError`, `queryFailed` như Task 1. Đặt `socketError = queryFailed(mssqlError('ConnectionError', 'ESOCKET'))`, `timeoutError = queryFailed(mssqlError('RequestError', 'ETIMEOUT'))`, `offlineError = queryFailed(mssqlError('RequestError', 'EREQUEST', 942))`.

```ts
const run = (error: unknown, token: string | undefined = 'tok') =>
	guard.run('DATA_LAKE', job as never, token, () => Promise.reject(error))

it('returns the work result and leaves the circuit alone', async () => {
	await expect(guard.run('DATA_LAKE', job as never, 'tok', async () => 7)).resolves.toBe(7)
	expect(circuit.open).not.toHaveBeenCalled()
})

it('pauses and requeues on a definitive outage without probing', async () => {
	await expect(run(offlineError)).rejects.toBeInstanceOf(WaitingError)
	expect(circuit.isHealthy).not.toHaveBeenCalled()
	expect(circuit.open).toHaveBeenCalledWith('DATA_LAKE', 'Q1', expect.any(String))
	expect(job.moveToWait).toHaveBeenCalledWith('tok')
	expect(circuit.open.mock.invocationCallOrder[0]).toBeLessThan(job.moveToWait.mock.invocationCallOrder[0])
})

it('pauses and requeues when a hung server only produces request timeouts', async () => {
	circuit.isHealthy.mockResolvedValue(false)
	await expect(run(timeoutError)).rejects.toBeInstanceOf(WaitingError)
	expect(circuit.open).toHaveBeenCalledTimes(1)
	expect(job.moveToWait).toHaveBeenCalledWith('tok')
})

it('retries normally after a single dropped connection while the database is healthy', async () => {
	circuit.isHealthy.mockResolvedValue(true)
	await expect(run(socketError)).rejects.toBe(socketError)
	expect(circuit.open).not.toHaveBeenCalled()
	expect(job.moveToWait).not.toHaveBeenCalled()
})

it('fails programming and data errors without retry', async () => {
	const error = queryFailed(mssqlError('RequestError', 'EREQUEST', 208))
	const thrown = await run(error).catch((e: unknown) => e)
	expect(thrown).toBeInstanceOf(UnrecoverableError)
	expect((thrown as Error).message).toBe(error.message)
	expect((thrown as Error).cause).toBe(error)
	expect(circuit.open).not.toHaveBeenCalled()
})

it.each([
	['transient', queryFailed(mssqlError('RequestError', 'EREQUEST', 1205))],
	['unknown', new Error('mongo unavailable')]
])('rethrows %s errors untouched', async (_kind, error) => {
	await expect(run(error)).rejects.toBe(error)
	expect(circuit.isHealthy).not.toHaveBeenCalled()
})

it('rethrows the original error when the job cannot be requeued', async () => {
	job.moveToWait.mockRejectedValue(new Error('redis down'))
	await expect(run(offlineError)).rejects.toBe(offlineError)
})

it('rethrows the original error when no worker token is available', async () => {
	await expect(run(offlineError, undefined)).rejects.toBe(offlineError)
	expect(circuit.open).not.toHaveBeenCalled()
})
```

- [ ] **Bước 2: Chạy unit test và xác nhận thất bại**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/mssql-queue-guard.service.spec.ts`
Kết quả mong đợi: FAIL vì chưa có `MssqlQueueGuard`.

- [ ] **Bước 3: Viết `MssqlQueueGuard.run`**

```ts
try {
	return await work()
} catch (error) {
	const kind = classifyMssqlError(error)
	if (kind === 'permanent') throw toUnrecoverable(error)
	const down = kind === 'outage' || (kind === 'suspect' && !(await this.circuit.isHealthy(dataSourceToken)))
	if (!down || !token) throw error
	try {
		await this.circuit.open(dataSourceToken, job.queueName, reasonOf(error))
		await job.moveToWait(token)
	} catch (gateError) {
		this.logger.error(gateError, `Unable to hold job "${job.id}" of "${job.queueName}" during MSSQL outage`)
		throw error
	}
	throw new WaitingError()
}
```

`toUnrecoverable` tạo `UnrecoverableError` với message gốc và gán `cause`. `reasonOf` trả message của lỗi, cắt còn tối đa 200 ký tự. Dùng `Logger` của `@nestjs/common`.

- [ ] **Bước 4: Chạy lại unit test và xác nhận qua**

Chạy lại lệnh ở Bước 2. Kết quả mong đợi: PASS, 9 test.

- [ ] **Bước 5: Viết integration test với Redis local**

Theo mẫu `src/modules/packing/specs/manifest-export.redis.spec.ts`: chỉ chạy khi `RUN_MSSQL_CIRCUIT_REDIS_TESTS === '1'`, ném lỗi nếu `REDIS_HOST` không phải `localhost`, `127.0.0.1` hoặc `::1`. Dùng tên queue và data source token ngẫu nhiên (`randomUUID`), `MssqlCircuitService` thật với ioredis thật, `moduleRef` giả trả về queue thật và `DataSource` giả điều khiển bằng cờ `dbUp`. `Worker` gọi `guard.run(ds, job, token, work)`, trong đó `work` là `jest.fn` reject `queryFailed(mssqlError('ConnectionError', 'ESOCKET'))` khi `dbUp` là `false`. Dọn dẹp trong `finally`: đóng worker, events, `queue.obliterate({ force: true })`, xóa bốn key của mạch.

```ts
const job = await queue.add('sync', {}, { attempts: 3, backoff: { type: 'fixed', delay: 100 } })
await waitFor(async () => (await queue.getJobCounts('paused')).paused === 1)
expect(await queue.isPaused()).toBe(true)
expect(await queue.getJobCounts('paused', 'failed', 'active')).toEqual({ paused: 1, failed: 0, active: 0 })
expect((await queue.getJob(job.id)).attemptsMade).toBe(0)

dbUp = true
for (let i = 0; i < 3; i++) await circuit.tick(Date.now() + 31_000)
await job.waitUntilFinished(events, 30000)
expect(work).toHaveBeenCalledTimes(2)
expect(await queue.isPaused()).toBe(false)
expect(await redis.smembers('mssql:circuit:open')).not.toContain(ds)
```

`waitFor(check: () => Promise<boolean>)` thăm dò mỗi 50ms, tối đa 10 giây.

- [ ] **Bước 6: Chạy integration test với Redis local**

Chạy: `$env:RUN_MSSQL_CIRCUIT_REDIS_TESTS='1'; pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/mssql-queue-guard.redis.spec.ts`
Kết quả mong đợi: PASS. Không đặt biến môi trường thì test được skip.

- [ ] **Bước 7: Commit**

```bash
git add src/databases/mssql-availability/mssql-queue-guard.service.ts src/databases/mssql-availability/specs/mssql-queue-guard.service.spec.ts src/databases/mssql-availability/specs/mssql-queue-guard.redis.spec.ts
git commit -m "feat: hold bullmq jobs during mssql outages"
```

### Task 4: Module và áp dụng guard cho bảy consumer

**Files:**
- Tạo: `src/databases/mssql-availability/mssql-availability.module.ts`
- Tạo: `src/databases/mssql-availability/README.md`
- Sửa: `src/databases/index.ts`
- Sửa: `src/app.module.ts`
- Sửa: bảy file consumer ở mục "Phạm vi"
- Test: `src/databases/mssql-availability/specs/gated-consumers.spec.ts`

**Interfaces:**
- Sử dụng: `MssqlCircuitService` (Task 2), `MssqlQueueGuard` (Task 3), hai tên metric trong `constants.ts`.
- Cung cấp: `MssqlAvailabilityModule` là module `@Global()`, export `MssqlQueueGuard` và `MssqlCircuitService`. Mỗi consumer nhận thêm tham số constructor cuối cùng `private readonly guard: MssqlQueueGuard` và chữ ký `process(job, token?: string)`.

- [ ] **Bước 1: Viết test thất bại**

`guard = { run: jest.fn().mockResolvedValue(undefined) }`, `job = { id: '1', data: [], queueName: 'Q' }`, `stub = {}`.

```ts
it.each<[string, () => WorkerHost]>([
	['CommitStockBalancesConsumer', () => new CommitStockBalancesConsumer(stub as never, guard as never)],
	['CommitStockOutConsumer', () => new CommitStockOutConsumer(stub as never, guard as never)],
	['CommitExchangeMoConsumer', () => new CommitExchangeMoConsumer(stub as never, guard as never)],
	['CommitUpsertEpcsMatchConsumer', () => new CommitUpsertEpcsMatchConsumer(stub as never, stub as never, guard as never)],
	['RollbackStockTxConsumer', () => new RollbackStockTxConsumer(stub as never, guard as never)],
	['SyncDefectiveGoodsConsumer', () => new SyncDefectiveGoodsConsumer(stub as never, stub as never, stub as never, stub as never, guard as never)],
	['SyncDispatchOrderConsumer', () => new SyncDispatchOrderConsumer(stub as never, stub as never, stub as never, guard as never)]
])('%s runs all of its work through the MSSQL guard', async (_name, create) => {
	await create().process(job as never, 'tok')
	expect(guard.run).toHaveBeenCalledWith(DATA_SOURCE_DATA_LAKE, job, 'tok', expect.any(Function))
})

it('still commits stock balances when the guard runs the work', async () => {
	const repository = { commitStockFluctuation: jest.fn().mockResolvedValue(undefined) }
	guard.run.mockImplementationOnce((_ds: string, _job: unknown, _token: string, work: () => Promise<void>) => work())
	await new CommitStockBalancesConsumer(repository as never, guard as never).process(job as never, 'tok')
	expect(repository.commitStockFluctuation).toHaveBeenCalledWith(job.data)
})
```

Test đầu chứng minh toàn bộ thân `process` nằm trong guard: `stub` rỗng nên mọi lời gọi ngoài guard sẽ ném `TypeError`.

- [ ] **Bước 2: Chạy test và xác nhận thất bại**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/gated-consumers.spec.ts`
Kết quả mong đợi: FAIL, `guard.run` chưa được gọi.

- [ ] **Bước 3: Tạo `MssqlAvailabilityModule` và đăng ký vào ứng dụng**

Provider: `MssqlCircuitService`, `MssqlQueueGuard`, `makeGaugeProvider` cho `MSSQL_CIRCUIT_OPEN_GAUGE` và `makeCounterProvider` cho `MSSQL_CIRCUIT_OPENED_COUNTER`, cả hai có `labelNames: ['data_source']`. Export module từ `src/databases/index.ts` và thêm vào `imports` của `AppModule` ngay sau `MetricsModule`.

- [ ] **Bước 4: Bọc thân `process` của bảy consumer**

Toàn bộ thân hiện tại của `process` trở thành callback của `this.guard.run(DATA_SOURCE_DATA_LAKE, job, token, async () => { ... })`. Không đổi logic bên trong, không đổi `@Processor`. `SyncDefectiveGoodsConsumer` và `SyncDispatchOrderConsumer` đang destructure `{ data }` ở tham số: đổi thành nhận `job` rồi lấy `job.data` bên trong callback.

- [ ] **Bước 5: Viết `README.md`**

Viết bằng tiếng Việt, theo cách trình bày của `src/databases/cdc/README.md`, gồm: luồng xử lý; bảng phân loại lỗi và cách bổ sung số lỗi mới; bốn key Redis; danh sách queue được gate và không được gate kèm lý do; cách thêm queue mới vào cơ chế; thao tác vận hành (xem trạng thái bằng `HGETALL mssql:circuit:DATA_LAKE`, queue pause thủ công trước sự cố không bị resume, queue pause thủ công trong lúc sự cố sẽ được resume cùng mạch); hai biểu thức alert `max(mssql_circuit_open) == 1` kéo dài 2 phút và `increase(bullmq_jobs_total{status="failed"}[5m]) > 0`; bảng idempotency dưới đây.

| Queue | Chạy lại sau khi đã commit |
| --- | --- |
| `COMMIT_STOCK_BALANCES_QUEUE`, `COMMIT_STOCK_OUT_QUEUE` | An toàn: `MERGE` theo `EPC_Code + mo_no + stationNO`; `record_time` nhận thời điểm chạy lại |
| `COMMIT_UPSERT_EPC_MATCH_QUEUE` | An toàn: `MERGE` theo `EPC_Code` |
| `ROLLBACK_STOCK_TX_QUEUE` | An toàn: `DELETE` theo điều kiện |
| `DEFECTIVE_GOODS_SYNC_QUEUE` | An toàn: `MERGE` theo `sync_id` |
| `SYNC_DISPATCH_ORDER_QUEUE` | An toàn: đọc trạng thái mới nhất rồi đối soát |
| `COMMIT_EXCHANGE_MO_QUEUE` | An toàn sau Task 5 |

- [ ] **Bước 6: Chạy test, typecheck và lint**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/databases/mssql-availability/specs/gated-consumers.spec.ts`
Kết quả mong đợi: PASS, 8 test.

Chạy: `pnpm typecheck`
Kết quả mong đợi: PASS theo định nghĩa ở Global Constraints.

Chạy: `pnpm exec eslint src/databases/mssql-availability src/modules/finished-goods/infrastructure/queues/consumers src/modules/defective-goods/infrastructure/queues/consumers src/modules/truckload-delivery/infrastructure/queues/consumers`
Kết quả mong đợi: không có lỗi.

- [ ] **Bước 7: Commit**

```bash
git add src/databases/mssql-availability src/databases/index.ts src/app.module.ts src/modules/finished-goods/infrastructure/queues/consumers src/modules/defective-goods/infrastructure/queues/consumers src/modules/truckload-delivery/infrastructure/queues/consumers
git commit -m "feat: gate mssql sync queues behind outage guard"
```

### Task 5: Đổi MO an toàn khi job chạy lại

**Files:**
- Sửa: `src/modules/finished-goods/infrastructure/persistence/mssql/repositories/finished-goods-audit.repository.ts` (method `exchangeManufacturingOrder`)
- Test: `src/modules/finished-goods/infrastructure/persistence/mssql/repositories/specs/finished-goods-audit.repository.spec.ts`

**Interfaces:**
- Sử dụng: `In`, `Not` từ `typeorm`; `TransactionHost` từ `@nestjs-cls/transactional`.
- Cung cấp: `exchangeManufacturingOrder(exchangeSkus: Array<string>, targetMo: string): Promise<void>` giữ nguyên chữ ký; chỉ cập nhật các dòng có `mo_no` khác `targetMo`.

Lý do: câu `UPDATE` hiện gán `mo_no_actual = mo_no` rồi `mo_no = targetMo`. Chạy lần hai sau khi lần đầu đã commit sẽ ghi `mo_no_actual = targetMo`, làm mất MO gốc.

- [ ] **Bước 1: Viết test thất bại**

```ts
it('skips rows already moved to the target MO so a rerun keeps the original MO', async () => {
	jest.spyOn(TransactionHost, 'getInstance').mockReturnValue({
		withTransaction: (_propagation: unknown, _options: unknown, fn: () => unknown) => fn()
	} as never)
	const update = jest.fn().mockResolvedValue({ affected: 1 })
	const repository = new FinishedGoodsAuditRepository({ tx: { getRepository: () => ({ update }) } } as never)

	await repository.exchangeManufacturingOrder(['E1'], 'MO2')

	expect(update).toHaveBeenCalledWith(
		{ epc: In(['E1']), mo_no: Not('MO2') },
		expect.objectContaining({ mo_no: 'MO2' })
	)
})
```

- [ ] **Bước 2: Chạy test và xác nhận thất bại**

Chạy: `pnpm exec jest --runInBand --runTestsByPath src/modules/finished-goods/infrastructure/persistence/mssql/repositories/specs/finished-goods-audit.repository.spec.ts`
Kết quả mong đợi: FAIL vì điều kiện hiện tại chỉ có `{ epc: In(['E1']) }`.

- [ ] **Bước 3: Thêm `mo_no: Not(targetMo)` vào điều kiện của `update`**

- [ ] **Bước 4: Chạy lại test và toàn bộ kiểm tra**

Chạy lại lệnh ở Bước 2. Kết quả mong đợi: PASS.

Chạy: `pnpm test`
Kết quả mong đợi: PASS; các integration test cần biến môi trường riêng được skip.

Chạy: `pnpm typecheck`
Kết quả mong đợi: PASS theo định nghĩa ở Global Constraints.

- [ ] **Bước 5: Commit**

```bash
git add src/modules/finished-goods/infrastructure/persistence/mssql/repositories/finished-goods-audit.repository.ts src/modules/finished-goods/infrastructure/persistence/mssql/repositories/specs/finished-goods-audit.repository.spec.ts
git commit -m "fix: keep original mo when exchange mo job is rerun"
```
