WITH datalist AS (
	SELECT EPC_Code, ISNULL(mo_no, 'Unknown') AS mo_no, ISNULL(size_code, 'Unknown') AS size_numcode, rfid_status, record_time, stationNO, FC_server_code, ISNULL(dept_name, 'Unknown') AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE 
		rfid_status = 'A'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH10[12]'
	UNION ALL
	SELECT EPC_Code, ISNULL(mo_no, 'Unknown') AS mo_no, ISNULL(size_code, 'Unknown') AS size_numcode, rfid_status, record_time, stationNO, FC_server_code, ISNULL(dept_name, 'Unknown') AS dept_name, storage
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
	WHERE 
		rfid_status = 'A'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH10[12]'
),
dept_grouping AS (
	SELECT mo_no, STRING_AGG(dept_name, ', ') AS dept_name
	FROM (
		SELECT DISTINCT mo_no, dept_name
		FROM datalist
	) AS unique_dept
	GROUP BY mo_no
),
accumulated_counts AS
(
	SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM datalist
	GROUP BY mo_no
),
storage_grouping AS (
	SELECT mo_no, STRING_AGG(storage_name, ', ') AS storage_name
	FROM DV_DATA_LAKE.dbo.dv_warehouseccodedet wh
	LEFT JOIN (
		SELECT DISTINCT mo_no, storage FROM datalist inv
		WHERE inv.storage IS NOT NULL
	) AS unique_storage
		ON unique_storage.storage = storage_num
	GROUP BY mo_no
)
SELECT
	inv.mo_no,
	ISNULL(match.shoestyle_codefactory,'Unknown') AS shoes_style_code_factory,
	ISNULL(prod.mat_ecolor, 'Unknown') AS mat_ecolor,
	dg.dept_name AS shaping_dept_name,
	inv.FC_server_code AS factory_code,
	ISNULL(sg.storage_name, 'Unknown') AS storage,
	CAST(ISNULL(manf.mo_sumqty, 0) AS INT) AS order_qty,
	ac.accumulated_qty,
	COUNT(DISTINCT inv.EPC_Code) AS daily_inbound_qty,
	(manf.mo_sumqty - COALESCE(ac.accumulated_qty, 0)) AS missing_qty,
	sz.size_data
FROM datalist inv
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust match
	ON inv.EPC_Code = match.EPC_Code
LEFT JOIN storage_grouping sg
	ON sg.mo_no = inv.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf
	ON manf.mo_no = inv.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod
	ON match.mat_code = prod.mat_code
LEFT JOIN accumulated_counts ac
	ON ac.mo_no = inv.mo_no
LEFT JOIN dept_grouping dg
	ON dg.mo_no = inv.mo_no
OUTER APPLY (
	SELECT (
		SELECT size_numcode, COUNT(DISTINCT EPC_Code) AS qty
		FROM datalist d 
		WHERE d.mo_no = inv.mo_no AND CAST(d.record_time AS DATE) = @0
		GROUP BY size_numcode
		FOR JSON PATH) AS size_data
) sz
WHERE CAST(inv.record_time AS DATE) = @0
GROUP BY 
	inv.mo_no, prod.mat_ecolor, manf.mo_sumqty, ac.accumulated_qty,
	match.shoestyle_codefactory, dg.dept_name, sg.storage_name, inv.FC_server_code, sz.size_data