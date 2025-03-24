WITH data_src AS (
	SELECT DISTINCT EPC_Code, COALESCE(mo_no, 'Unknown') AS mo_no, COALESCE(size_code, 'Unknown') AS size_numcode, rfid_status, record_time, stationNO, FC_server_code AS factory_code, ISNULL(dept_name, 'Unknown') AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE 
		rfid_status = 'A'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH10[12]'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
	UNION ALL
	SELECT DISTINCT EPC_Code, COALESCE(mo_no, 'Unknown') AS mo_no, COALESCE(size_code, 'Unknown') AS size_numcode, rfid_status, record_time, stationNO, FC_server_code AS factory_code, ISNULL(dept_name, 'Unknown') AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
	WHERE 
		rfid_status = 'A'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH10[12]'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
),
cmd_det AS (
	SELECT DISTINCT mo_no, storage, dept_name, factory_code  FROM data_src
	WHERE storage IS NOT NULL AND dept_name IS NOT NULL
),
dept_ls AS (
	SELECT mo_no, factory_code, STRING_AGG(dept_name, ', ') WITHIN GROUP (ORDER BY dept_name) AS dept_name
	FROM (SELECT DISTINCT dept_name, mo_no, factory_code FROM cmd_det) a
	GROUP BY factory_code, mo_no
),
storage_ls AS (
	SELECT mo_no, factory_code, STRING_AGG(b.storage_name, ', ') WITHIN GROUP (ORDER BY storage) AS storage_name
	FROM (SELECT DISTINCT storage, mo_no, factory_code FROM cmd_det) a
	LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet b 
		ON a.storage = b.storage_num
	GROUP BY factory_code, mo_no
),
acc_counts AS
(
	SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM data_src
	GROUP BY mo_no
)
SELECT
	ds.factory_code,
	ds.mo_no,
	COALESCE(rmc.shoestyle_codefactory,'Unknown') AS shoes_style_code_factory,
	COALESCE(prod.mat_ecolor, 'Unknown') AS mat_ecolor,
	dg.dept_name AS shaping_dept_name,
	sg.storage_name AS storage,
	COALESCE(manf.mo_sumqty, 0) AS order_qty,
	ac.accumulated_qty,
	COUNT(DISTINCT ds.EPC_Code) AS daily_inbound_qty,
	manf.mo_sumqty - ac.accumulated_qty AS missing_qty,
	sz.size_data
FROM data_src ds
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc
	ON ds.EPC_Code = rmc.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf
	ON manf.mo_no = ds.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod
	ON rmc.mat_code = prod.mat_code
LEFT JOIN storage_ls sg
	ON sg.mo_no = ds.mo_no AND sg.factory_code = ds.factory_code
LEFT JOIN dept_ls dg
	ON dg.mo_no = ds.mo_no AND dg.factory_code = ds.factory_code
LEFT JOIN acc_counts ac
	ON ac.mo_no = ds.mo_no
OUTER APPLY (
	SELECT (
		SELECT size_numcode, COUNT(DISTINCT EPC_Code) AS qty
		FROM data_src d 
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