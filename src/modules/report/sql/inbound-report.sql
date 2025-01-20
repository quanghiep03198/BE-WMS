WITH datalist AS (
	SELECT EPC_Code, mo_no, mo_no_actual, rfid_status, record_time, dept_name FROM dv_InvRFIDrecorddet
	UNION ALL 
	SELECT EPC_Code, mo_no, mo_no_actual, rfid_status, record_time, dept_name FROM dv_InvRFIDrecorddet_backup_Daily
)
SELECT 
	COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown') AS mo_no,
	match.mat_code,
	match.shoestyle_codefactory AS shoes_style_code_factory,
	inv.dept_name AS shaping_dept_name,
	CAST(manf.mo_sumqty AS INT) AS order_qty,
	COUNT(DISTINCT inv.EPC_Code) AS inbound_qty,
	CAST(inv.record_time AS DATE) AS inbound_date, 
	CASE WHEN COUNT(inv.mo_no_actual) > 0 THEN 1 ELSE 0 END AS is_exchanged
FROM datalist inv
LEFT JOIN dv_rfidmatchmst_cust match
	ON 
		inv.EPC_Code = match.EPC_Code 
		AND COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown') = COALESCE(match.mo_no_actual, match.mo_no, 'Unknown')
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf
	ON manf.mo_no = COALESCE(inv.mo_no_actual, inv.mo_no)
WHERE 
	inv.rfid_status IS NOT NULL
	AND inv.EPC_Code NOT LIKE '303429%'
	AND inv.EPC_Code NOT LIKE 'E28%'
	AND COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown') NOT IN ('13D05B006')
	AND CAST(inv.record_time AS DATE) = CAST(@0 AS DATE) -- Đảm bảo sử dụng ngày chuẩn ISO
GROUP BY 
	COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown'),
	manf.mo_sumqty,
	inv.dept_name,
	CAST(inv.record_time AS DATE),
	match.mat_code,
	match.shoestyle_codefactory