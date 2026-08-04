export default /* SQL */ `
DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

-- * Retrieves inbound report data around last 2 years
WITH rfid_inbound_cte AS (
	SELECT EPC_Code, COALESCE(mo_no, @FallbackValue) AS mo_no, COALESCE(size_code, @FallbackValue) AS size_numcode, rfid_status, record_time, stationNO, FC_server_code AS factory_code, ISNULL(dept_name, @FallbackValue) AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
	WHERE 
		isactive = 'Y'
		AND rfid_status = 'A'
		AND stationNO LIKE 'CUS%WH10[12]'
		AND mo_no NOT IN ('13D05B006', '13A08C003')
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
	UNION ALL
	SELECT EPC_Code, COALESCE(mo_no, @FallbackValue) AS mo_no, COALESCE(size_code, @FallbackValue) AS size_numcode, rfid_status, record_time, stationNO, FC_server_code AS factory_code, ISNULL(dept_name, @FallbackValue) AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
	WHERE 
		isactive = 'Y'
		AND rfid_status = 'A'
		AND stationNO LIKE 'CUS%WH10[12]'
		AND mo_no NOT IN ('13D05B006', '13A08C003')
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
),

-- * Command number details
inbound_detail_cte AS (
	SELECT DISTINCT mo_no, storage, dept_name, factory_code  FROM rfid_inbound_cte
	WHERE 
	storage IS NOT NULL 
	AND dept_name IS NOT NULL
	AND CAST(record_time AS DATE) = @0
),

-- * Department list of each command number
department_list_cte AS (
	SELECT mo_no, factory_code, STRING_AGG(dept_name, ', ') WITHIN GROUP (ORDER BY dept_name) AS dept_name
	FROM (SELECT DISTINCT dept_name, mo_no, factory_code FROM inbound_detail_cte) a
	WHERE dept_name IS NOT NULL
	GROUP BY factory_code, mo_no
),

-- * Storage list of each command number
storage_list_cte AS (
	SELECT mo_no, factory_code, STRING_AGG(b.storage_name, ', ') WITHIN GROUP (ORDER BY storage ASC) AS storage_name
	FROM (SELECT DISTINCT storage, mo_no, factory_code FROM inbound_detail_cte) a
	LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet b
		ON a.storage = b.storage_num
	GROUP BY factory_code, mo_no
),

-- * Accumulated quantity of each command number
accumulated_cte AS
(
	SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM rfid_inbound_cte
	GROUP BY mo_no
)

-- * Main query to retrieve inbound report data
SELECT
	ric.factory_code,
	ric.mo_no,
	COALESCE(rmc.shoestyle_codefactory,@FallbackValue) AS factory_shoes_style,
	COALESCE(prod.color_sn, @FallbackValue) AS color_sn,
	dlc.dept_name AS shaping_dept_name,
	slc.storage_name AS storage,
	CAST(COALESCE(manf.mo_totalqty, 0) AS INT) AS order_qty,
	ac.accumulated_qty,
	COUNT(DISTINCT ric.EPC_Code) AS daily_inbound_qty,
	CAST((manf.mo_totalqty - ac.accumulated_qty) AS INT) AS missing_qty,
	(
		SELECT size_numcode, COUNT(DISTINCT EPC_Code) AS qty
		FROM rfid_inbound_cte d 
		WHERE d.mo_no = ric.mo_no AND CAST(d.record_time AS DATE) = @0
		GROUP BY size_numcode
		FOR JSON PATH
	) AS size_data
FROM rfid_inbound_cte ric
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc 
	ON ric.EPC_Code = rmc.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf 
	ON manf.mo_no = ric.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod 
	ON rmc.mat_code = prod.mat_code
LEFT JOIN storage_list_cte slc
	ON slc.mo_no = ric.mo_no AND slc.factory_code = ric.factory_code
LEFT JOIN department_list_cte dlc
	ON dlc.mo_no = ric.mo_no AND dlc.factory_code = ric.factory_code
LEFT JOIN accumulated_cte ac 
	ON ac.mo_no = ric.mo_no
WHERE CAST(ric.record_time AS DATE) = @0
GROUP BY 
	ric.factory_code, ric.mo_no, rmc.shoestyle_codefactory, 
	prod.color_sn, manf.mo_totalqty, ac.accumulated_qty,
	slc.storage_name, dlc.dept_name
ORDER BY ric.mo_no DESC
OPTION (
	OPTIMIZE FOR UNKNOWN,                        		-- * Avoid "Parameter Sniffing" issues
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),    	-- * Prioritize parallel plan
	RECOMPILE                                         	-- * Re-optimize for each execution
);

`
