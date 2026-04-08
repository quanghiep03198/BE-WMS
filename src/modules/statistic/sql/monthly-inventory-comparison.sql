DECLARE @CurrentDate DATE = GETDATE();
DECLARE @CurrentYear INT = YEAR(@CurrentDate);
DECLARE @CurrentMonth INT = MONTH(@CurrentDate);
DECLARE @CurrentDay INT = DAY(@CurrentDate);
DECLARE @PrevYear INT = CASE WHEN @CurrentMonth = 1 THEN @CurrentYear - 1 ELSE @CurrentYear END;
DECLARE @PrevMonth INT = CASE WHEN @CurrentMonth = 1 THEN 12 ELSE @CurrentMonth - 1 END;

-- * Calculate precise date ranges for comparison
DECLARE @CurrentMonthStart DATE = DATEFROMPARTS(@CurrentYear, @CurrentMonth, 1);
DECLARE @CurrentPeriodEnd DATE = @CurrentDate;
DECLARE @PrevMonthStart DATE = DATEFROMPARTS(@PrevYear, @PrevMonth, 1);
DECLARE @PrevPeriodEnd DATE = DATEFROMPARTS(@PrevYear, @PrevMonth, @CurrentDay);
DECLARE @CurrentYearMonth VARCHAR(10) = CAST(@CurrentYear AS VARCHAR(10)) + RIGHT('0' + CAST(@CurrentMonth AS VARCHAR(2)), 2);
DECLARE @PrevYearMonth VARCHAR(10) = CAST(@PrevYear AS VARCHAR(10)) + RIGHT('0' + CAST(@PrevMonth AS VARCHAR(2)), 2);

-- * Temporary table approach cho large dataset
IF OBJECT_ID('tempdb..#tmp_rfid_data') IS NOT NULL DROP TABLE #tmp_rfid_data;


WITH CTE AS (
    SELECT EPC_Code, rfid_status, stationNO, record_time, isactive FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK) WHERE isactive = 'Y'
    UNION ALL 
    SELECT EPC_Code, rfid_status, stationNO, record_time, isactive FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK) WHERE isactive = 'Y'
)
SELECT 
    CASE 
        WHEN CAST(record_time AS DATE) >= CAST(@CurrentMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST (@CurrentPeriodEnd AS DATE) THEN 'CURR'
        WHEN CAST(record_time AS DATE) >= CAST(@PrevMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST (@PrevPeriodEnd AS DATE) THEN 'PREV'
    END AS period_type,
    rfid_status,
    RIGHT(stationNO, 3) AS station_suffix,
    COUNT(DISTINCT EPC_Code) as record_count
INTO #tmp_rfid_data
FROM (SELECT DISTINCT EPC_Code, rfid_status, stationNO, record_time, isactive FROM CTE) a
WHERE 
    isactive = 'Y' 
    AND rfid_status IN ('A', 'B')
    AND RIGHT(stationNO, 3) IN ('101', '103')
    AND (
        (CAST(record_time AS DATE) >= CAST(@CurrentMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST(@CurrentPeriodEnd AS DATE)) OR
        (CAST(record_time AS DATE) >= CAST(@PrevMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST(@PrevPeriodEnd AS DATE))
    )
GROUP BY 
    CASE 
        WHEN CAST(record_time AS DATE) >= CAST(@CurrentMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST (@CurrentPeriodEnd AS DATE) THEN 'CURR'
        WHEN CAST(record_time AS DATE) >= CAST(@PrevMonthStart AS DATE) AND CAST(record_time AS DATE) <= CAST (@PrevPeriodEnd AS DATE) THEN 'PREV'
    END,
    rfid_status, RIGHT(stationNO, 3)
OPTION (HASH GROUP, MAXDOP 4);

-- * Create index on temp table
CREATE INDEX IX_TempRFIDData ON #tmp_rfid_data (period_type, rfid_status, station_suffix);

-- * Main query using the temp table
WITH aggregated_data AS (
    SELECT 
        SUM(CASE WHEN period_type = 'CURR' AND rfid_status = 'A' AND station_suffix = '101' THEN record_count ELSE 0 END) AS curr_month_inbound,
        SUM(CASE WHEN period_type = 'CURR' AND rfid_status = 'B' AND station_suffix = '103' THEN record_count ELSE 0 END) AS curr_month_outbound,
        SUM(CASE WHEN period_type = 'PREV' AND rfid_status = 'A' AND station_suffix = '101' THEN record_count ELSE 0 END) AS prev_month_inbound,
        SUM(CASE WHEN period_type = 'PREV' AND rfid_status = 'B' AND station_suffix = '103' THEN record_count ELSE 0 END) AS prev_month_outbound
    FROM #tmp_rfid_data
),
inventory_data AS (
    SELECT 
        CAST(COALESCE(SUM(CASE WHEN inv_yearmonth = @CurrentYearMonth THEN inv_initialqty END), 0) AS INT) AS curr_month_initial_qty,
        CAST(COALESCE(SUM(CASE WHEN inv_yearmonth = @CurrentYearMonth THEN inv_finalqty END), 0) AS INT) AS curr_month_final_qty,
        CAST(COALESCE(SUM(CASE WHEN inv_yearmonth = @PrevYearMonth THEN inv_initialqty END), 0) AS INT) AS prev_month_initial_qty,
        CAST(COALESCE(SUM(CASE WHEN inv_yearmonth = @PrevYearMonth THEN inv_finalqty END), 0) AS INT) AS prev_month_final_qty
    FROM DV_DATA_LAKE.dbo.dv_invprodmst WITH (NOLOCK)
    WHERE inv_type = 'FG' 
      AND inv_yearmonth IN (@CurrentYearMonth, @PrevYearMonth)
)


SELECT 
    @CurrentDate AS comparison_date,
    CONCAT(FORMAT(@CurrentMonthStart, 'dd/MM/yyyy'), ' - ', FORMAT(@CurrentPeriodEnd, 'dd/MM/yyyy')) AS current_period,
    CONCAT(FORMAT(@PrevMonthStart, 'dd/MM/yyyy'), ' - ', FORMAT(@PrevPeriodEnd, 'dd/MM/yyyy')) AS previous_period,
    CAST(inv.curr_month_initial_qty + COALESCE(agg.curr_month_inbound, 0) - COALESCE(agg.curr_month_outbound, 0) AS INT) AS curr_period_inventory_qty,
    CAST(inv.prev_month_initial_qty + COALESCE(agg.prev_month_inbound, 0) - COALESCE(agg.prev_month_outbound, 0) AS INT) AS prev_period_inventory_qty,
    inv.curr_month_initial_qty,
    inv.curr_month_final_qty,
    COALESCE(agg.curr_month_inbound, 0) AS curr_month_inbound,
    COALESCE(agg.curr_month_outbound, 0) AS curr_month_outbound,
    inv.prev_month_initial_qty,
    inv.prev_month_final_qty,
    COALESCE(agg.prev_month_inbound, 0) AS prev_month_inbound,
    COALESCE(agg.prev_month_outbound, 0) AS prev_month_outbound
FROM inventory_data inv
CROSS JOIN aggregated_data agg;

-- * Cleanup
DROP TABLE #tmp_rfid_data;


