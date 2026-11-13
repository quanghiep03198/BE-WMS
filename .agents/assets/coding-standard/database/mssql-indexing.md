# Indexing & Queries — Database Coding Standards

> **Version:** 1.0 | **Updated:** 2026-11-12
> Read this file before writing or reviewing SQL queries, designing indexes, or investigating slow queries.

## Quick Checklist

- [ ] Indexes exist on all FK columns, frequently filtered columns, and ORDER BY columns
- [ ] Composite index column order matches query predicate order (most selective column first)
- [ ] Partial indexes used for frequently accessed subsets (e.g., WHERE status = 'pending')
- [ ] Covering indexes considered for hot queries to avoid heap fetches
- [ ] `EXPLAIN ANALYZE` run on every new or modified query
- [ ] Unused indexes audited regularly via `pg_stat_user_indexes`
- [ ] Functions are not applied to indexed columns in WHERE clauses (use range predicates instead)
- [ ] `SELECT *` is never used — only the columns needed are selected
- [ ] Correlated subqueries replaced with window functions or CTEs where possible
- [ ] Slow query logging enabled (`log_min_duration_statement = 100`)
- [ ] `pg_stat_statements` monitored for top slow queries
- [ ] Multi-step financial operations use `SERIALIZABLE` isolation level
- [ ] Cursor-based pagination used instead of OFFSET for large datasets

---

## 1. Index Design

```sql
-- ✅ Index on columns used in WHERE, JOIN, ORDER BY
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- ✅ Partial index for frequently filtered subset
CREATE INDEX idx_orders_pending ON orders(created_at)
WHERE status = 'pending';

-- ✅ Covering index — includes all columns needed by query (avoids heap fetch)
CREATE INDEX idx_orders_covering ON orders(customer_id, status)
INCLUDE (total, created_at);

-- ✅ EXPLAIN ANALYZE to verify index usage
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM orders WHERE customer_id = $1 AND status = 'pending';

-- ❌ Over-indexing — every write must update all indexes
-- Audit index usage regularly
SELECT
    schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0   -- unused indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 2. Query Optimization

```sql
-- ❌ Function on indexed column — index not used
SELECT * FROM orders WHERE DATE(created_at) = '2024-01-01';

-- ✅ Range predicate — index used
SELECT * FROM orders
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02';

-- ❌ SELECT * — fetches unnecessary columns
SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id;

-- ✅ Select only needed columns
SELECT o.id, o.status, o.total, c.name, c.email
FROM orders o JOIN customers c ON o.customer_id = c.id;

-- ❌ Subquery in WHERE executed per row (correlated subquery)
SELECT * FROM orders o
WHERE total > (SELECT AVG(total) FROM orders WHERE customer_id = o.customer_id);

-- ✅ Window function — single pass
SELECT *,
    AVG(total) OVER (PARTITION BY customer_id) AS customer_avg
FROM orders;
```

---

## 3. EXPLAIN Plans

Always verify that a query uses the expected index and does not perform an unexpected sequential scan.

```sql
-- Basic EXPLAIN
EXPLAIN SELECT * FROM orders WHERE customer_id = $1;

-- Full analysis with timing and buffer usage
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM orders WHERE customer_id = $1 AND status = 'pending';

-- Key signals to look for:
-- Seq Scan on a large table → missing index
-- Hash Join on very large sets → consider index nested loop
-- High "rows removed by filter" → index not selective enough
-- Buffers: shared hit= (cache) vs shared read= (disk I/O)
```

---

## 4. Transaction Isolation Levels

```sql
-- READ COMMITTED (default PostgreSQL) — sees committed data at statement start
-- REPEATABLE READ — sees snapshot at transaction start; prevents non-repeatable reads
-- SERIALIZABLE — full isolation; slowest but safest

-- ✅ Use SERIALIZABLE for critical financial operations
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    UPDATE accounts SET balance = balance - 100 WHERE id = $1;
    UPDATE accounts SET balance = balance + 100 WHERE id = $2;
COMMIT;

-- ❌ Missing transaction for multi-step operations
UPDATE inventory SET quantity = quantity - 1 WHERE product_id = $1;
-- server crash here → inventory decremented but order not created
INSERT INTO orders ...;
```

---

## 5. Slow Query Detection

```sql
-- PostgreSQL — enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = '100';  -- log queries > 100ms
SELECT pg_reload_conf();

-- Check pg_stat_statements for top slow queries
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## 6. Pagination

```sql
# ❌ Offset pagination is slow on large datasets
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
# → Database scans 10020 rows, discards 10000

# ✅ Cursor-based pagination
SELECT * FROM orders
WHERE created_at < $1  -- cursor = last item's created_at
ORDER BY created_at DESC
LIMIT 20;
```
