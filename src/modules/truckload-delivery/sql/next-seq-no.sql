WITH today_orders AS (
   SELECT
   dispatch_order,
   CAST(RIGHT(dispatch_order, 3) AS INT) AS seq_no
   FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
   WHERE CAST(created AS DATE) = CAST(GETDATE() AS DATE)
),
bounds AS (
   SELECT MAX(seq_no) AS max_seq
   FROM today_orders
),
-- Generate numbers 1 .. max_seq
nums AS (
   SELECT 1 AS n
   UNION ALL
   SELECT n + 1 FROM nums WHERE n < (SELECT max_seq FROM bounds)
),
-- Smallest gap in the sequence (NULL when no gap exists)
missing_seq AS (
   SELECT MIN(n) AS first_missing
   FROM nums
   WHERE n NOT IN (SELECT seq_no FROM today_orders)
)
SELECT COALESCE(m.first_missing, b.max_seq + 1) AS next_seq_no
FROM bounds b
CROSS JOIN missing_seq m
OPTION (MAXRECURSION 1000);