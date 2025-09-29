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

SELECT 
    CASE 
        WHEN record_time >= @CurrentMonthStart AND record_time <= @CurrentPeriodEnd THEN 'CURR'
        WHEN record_time >= @PrevMonthStart AND record_time <= @PrevPeriodEnd THEN 'PREV'
    END AS period_type,
    rfid_status,
    RIGHT(stationNO, 3) AS station_suffix,
    COUNT(*) as record_count
INTO #tmp_rfid_data
FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
WHERE 
    rfid_status IN ('A', 'B')
    AND RIGHT(stationNO, 3) IN ('101', '103')
    AND (
        (record_time >= @CurrentMonthStart AND record_time <= @CurrentPeriodEnd) OR
        (record_time >= @PrevMonthStart AND record_time <= @PrevPeriodEnd)
    )
GROUP BY 
    CASE 
        WHEN record_time >= @CurrentMonthStart AND record_time <= @CurrentPeriodEnd THEN 'CURR'
        WHEN record_time >= @PrevMonthStart AND record_time <= @PrevPeriodEnd THEN 'PREV'
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
    CAST(inv.curr_month_initial_qty + agg.curr_month_inbound - agg.curr_month_outbound AS INT) AS curr_period_inventory_qty,
    CAST(inv.prev_month_initial_qty + agg.prev_month_inbound - agg.prev_month_outbound AS INT) AS prev_period_inventory_qty,
    inv.curr_month_initial_qty,
    inv.curr_month_final_qty,
    agg.curr_month_inbound,
    agg.curr_month_outbound,
    inv.prev_month_initial_qty,
    inv.prev_month_final_qty,
    agg.prev_month_inbound,
    agg.prev_month_outbound
FROM inventory_data inv
CROSS JOIN aggregated_data agg

;
-- * Cleanup
DROP TABLE #tmp_rfid_data;