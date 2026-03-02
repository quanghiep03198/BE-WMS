-- Test performance
SET STATISTICS IO ON;
SET STATISTICS TIME ON;

DECLARE @CurrentYear INT = @0;
DECLARE @StartDate DATE = DATEFROMPARTS(@CurrentYear, 1, 1);  -- 01/01/năm hiện tại
DECLARE @EndDate DATE = DATEFROMPARTS(@CurrentYear, 12, 31);  -- 31/12/năm hiện tại

-- CTE to create 12 months
WITH months_cte AS (
   SELECT 1 [month]
   UNION ALL SELECT 2
   UNION ALL SELECT 3
   UNION ALL SELECT 4
   UNION ALL SELECT 5
   UNION ALL SELECT 6
   UNION ALL SELECT 7
   UNION ALL SELECT 8
   UNION ALL SELECT 9
   UNION ALL SELECT 10
   UNION ALL SELECT 11
   UNION ALL SELECT 12
),
-- Union all inbound data first, then count distinct
inbound_combined AS (
   SELECT 
      MONTH(record_time) AS month,
      EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND record_time >= @StartDate 
      AND record_time <= @EndDate
      AND rfid_status = 'A'
      AND stationNO LIKE '%WH101'
   UNION ALL
   SELECT 
      MONTH(record_time) AS month,
      EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND record_time >= @StartDate 
      AND record_time <= @EndDate
      AND rfid_status = 'A'
      AND stationNO LIKE '%WH101'
),
-- Union all outbound data first, then count distinct
outbound_combined AS (
   SELECT 
      MONTH(record_time) AS month,
      EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND record_time >= @StartDate 
      AND record_time <= @EndDate
      AND rfid_status = 'B'
      AND stationNO LIKE '%WH103'
   
   UNION 
   
   SELECT 
      MONTH(record_time) AS month,
      EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND record_time >= @StartDate 
      AND record_time <= @EndDate
      AND rfid_status = 'B'
      AND stationNO LIKE '%WH103'
),
total_inbound AS (
   SELECT 
      month,
      COUNT(DISTINCT EPC_Code) AS inbound_qty
   FROM inbound_combined
   GROUP BY month
),
total_outbound AS (
   SELECT 
      month,
      COUNT(DISTINCT EPC_Code) AS outbound_qty
   FROM outbound_combined
   GROUP BY month
),
final_statistics AS (
   SELECT 
      m.month,
      COALESCE(i.inbound_qty, 0) AS inbound_qty,
      COALESCE(o.outbound_qty, 0) AS outbound_qty
   FROM months_cte m
   LEFT JOIN total_inbound i ON m.month = i.month
   LEFT JOIN total_outbound o ON m.month = o.month
)
SELECT 
   @CurrentYear AS year,
   f.month,
   f.inbound_qty,
   f.outbound_qty,
   f.inbound_qty - f.outbound_qty AS net_flow,
   f.inbound_qty + f.outbound_qty AS total_transactions,
   CASE 
      WHEN f.outbound_qty = 0 THEN 
         IIF(f.inbound_qty > 0, 100.00, 0.00)
      ELSE 
         CAST(ROUND(f.inbound_qty * 100.0 / f.outbound_qty, 2) AS DECIMAL(10,2))
   END AS inbound_outbound_ratio,
   CONCAT('01/', FORMAT(f.month, '00'), '/', @CurrentYear, ' - ', 
          DAY(EOMONTH(DATEFROMPARTS(@CurrentYear, f.month, 1))), '/', 
          FORMAT(f.month, '00'), '/', @CurrentYear) AS period_range

FROM final_statistics f
ORDER BY f.month
OPTION (
   OPTIMIZE FOR UNKNOWN,                              -- Prevent parameter sniffing  
   USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),       -- Force parallel execution
   USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION'),  -- Better cardinality estimates
   MAXDOP 4,                                          -- Limit parallelism for better resource usage
   KEEPFIXED PLAN                                     -- Fresh execution plan each time
);

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;

/*
   year                    Năm thống kê
   month                   Số thứ tự tháng (1-12)  
   inbound_qty             Số lượng EPC nhập trong tháng
   outbound_qty            Số lượng EPC xuất trong tháng  
   net_flow                Chênh lệch nhập-xuất (dương=nhập nhiều hơn, âm=xuất nhiều hơn)
   inbound_outbound_ratio  Tỷ lệ nhập/xuất (%)
   total_transactions      Tổng số giao dịch (nhập+xuất)
   period_range            Khoảng thời gian tháng (01/01/2025 - 31/01/2025)
*/