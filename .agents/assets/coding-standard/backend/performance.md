# Performance — Backend Coding Standards

> **Version:** 1.0 | **Updated:** 2026-11-12
> Read this file before optimizing performance, investigating bottlenecks, or implementing caching.

## Quick Checklist

- [ ] Cache-aside pattern used for read-heavy data; TTL always set
- [ ] Cache stampede prevented with a mutex/lock on rebuild
- [ ] Connection pool size is tuned appropriately (not too high, not too low)
- [ ] Indexes exist on FK columns, frequently filtered columns, and ORDER BY columns
- [ ] N+1 queries eliminated with eager loading
- [ ] Cursor-based pagination used instead of OFFSET for large datasets
- [ ] Heavy computation offloaded to background jobs — not in the request path
- [ ] Async I/O used throughout — no blocking calls in an async context
- [ ] Circuit breaker applied on all external service calls
- [ ] Services are stateless — no in-memory state shared between requests
- [ ] Prometheus metrics instrument key latency and error rate paths

---

## Target Metrics

| Metric                    | Good       | Needs Improvement | Poor         |
| ------------------------- | ---------- | ----------------- | ------------ |
| **API Latency P95**       | ≤ 200ms    | ≤ 500ms           | > 500ms      |
| **API Latency P99**       | ≤ 500ms    | ≤ 1s              | > 1s         |
| **DB Query P95**          | ≤ 50ms     | ≤ 200ms           | > 200ms      |
| **Cache Hit Rate**        | ≥ 80%      | ≥ 60%             | < 60%        |
| **Throughput**            | Target RPS | 80% target        | < 50% target |
| **Error Rate**            | < 0.1%     | < 1%              | > 1%         |
| **Connection Pool Usage** | < 70%      | < 90%             | > 90%        |

---

## 1. Caching

### 1.1 Choose the Right Cache Strategy

| Strategy                       | When to Use                                           | Trade-off                                         |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| **Cache-aside** (lazy loading) | Read-heavy, data that changes infrequently            | First request is always a cache miss (cold start) |
| **Write-through**              | Need strong consistency between cache and DB          | Slower writes (2 writes per operation)            |
| **Read-through**               | Simplify application-level cache logic                | Cache library must support the pattern            |
| **Write-behind** (write-back)  | Write-heavy workloads tolerating eventual consistency | Risk of data loss if cache fails before write     |
