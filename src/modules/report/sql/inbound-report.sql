DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

-- * Retrieves inbound report data around last 2 years
WITH filtered_data AS (
	SELECT EPC_Code, COALESCE(mo_no, @FallbackValue) AS mo_no, COALESCE(size_code, @FallbackValue) AS size_numcode, rfid_status, record_time, stationNO, FC_server_code AS factory_code, ISNULL(dept_name, @FallbackValue) AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
	WHERE 
		rfid_status = 'A'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH10[12]'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
),

-- * Command number details
command_number_details AS (
	SELECT DISTINCT mo_no, storage, dept_name, factory_code  FROM filtered_data
	WHERE storage IS NOT NULL AND dept_name IS NOT NULL
),

-- * Department list of each command number
department_list AS (
	SELECT mo_no, factory_code, STRING_AGG(dept_name, ', ') WITHIN GROUP (ORDER BY dept_name) AS dept_name
	FROM (SELECT DISTINCT dept_name, mo_no, factory_code FROM command_number_details) a
	GROUP BY factory_code, mo_no
),

-- * Storage list of each command number
storage_list AS (
	SELECT mo_no, factory_code, STRING_AGG(b.storage_name, ', ') WITHIN GROUP (ORDER BY storage) AS storage_name
	FROM (SELECT DISTINCT storage, mo_no, factory_code FROM command_number_details) a
	LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet b WITH (NOLOCK) 
		ON a.storage = b.storage_num
	GROUP BY factory_code, mo_no
),

-- * Accumulated quantity of each command number
accumulated AS
(
	SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM filtered_data
	GROUP BY mo_no
)

-- * Main query to retrieve inbound report data
SELECT
	ds.factory_code,
	ds.mo_no,
	COALESCE(rmc.shoestyle_codefactory,@FallbackValue) AS shoes_style_code_factory,
	COALESCE(prod.mat_ecolor, @FallbackValue) AS mat_ecolor,
	dg.dept_name AS shaping_dept_name,
	sg.storage_name AS storage,
	COALESCE(manf.mo_sumqty, 0) AS order_qty,
	ac.accumulated_qty,
	COUNT(DISTINCT ds.EPC_Code) AS daily_inbound_qty,
	manf.mo_sumqty - ac.accumulated_qty AS missing_qty,
	sz.size_data
FROM filtered_data ds
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc WITH (NOLOCK)
	ON ds.EPC_Code = rmc.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf WITH (NOLOCK)
	ON manf.mo_no = ds.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod WITH (NOLOCK)
	ON rmc.mat_code = prod.mat_code
LEFT JOIN storage_list sg
	ON sg.mo_no = ds.mo_no AND sg.factory_code = ds.factory_code
LEFT JOIN department_list dg
	ON dg.mo_no = ds.mo_no AND dg.factory_code = ds.factory_code
LEFT JOIN accumulated ac
	ON ac.mo_no = ds.mo_no
OUTER APPLY (
	SELECT (
		SELECT size_numcode, COUNT(DISTINCT EPC_Code) AS qty
		FROM filtered_data d 
		WHERE d.mo_no = ds.mo_no AND CAST(d.record_time AS DATE) = @0
		GROUP BY size_numcode
		FOR JSON PATH
	) AS size_data
) sz
WHERE CAST(ds.record_time AS DATE) = @0
GROUP BY 
	ds.factory_code, ds.mo_no, rmc.shoestyle_codefactory, 
	prod.mat_ecolor, manf.mo_sumqty, ac.accumulated_qty,
	sg.storage_name, dg.dept_name, sz.size_data
	
-- * Avoid parameter sniffing and set max degree of parallelism;
OPTION (OPTIMIZE FOR UNKNOWN);