WITH datalist AS (
   SELECT EPC_Code, mo_no, rfid_status, record_time, stationNO, FC_server_code, dept_name
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
   WHERE
	 	rfid_status = 'B'
		AND stationNO LIKE 'CUS%WH103'
		AND EPC_Code NOT LIKE '303429%' 
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
   UNION ALL
   SELECT EPC_Code, mo_no, rfid_status, record_time, stationNO, FC_server_code, dept_name
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily 
	WHERE
	 	rfid_status = 'B'
		AND stationNO LIKE 'CUS%WH103'
		AND EPC_Code NOT LIKE '303429%' 
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
),
accumulated_counts AS (
	SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM datalist
	GROUP BY mo_no
)
SELECT
	ISNULL(inv.mo_no, 'Unknown') AS mo_no,
	ISNULL(match.shoestyle_codefactory, 'Unknown') AS shoes_style_code_factory,
	ISNULL(prod.mat_ecolor, 'Unknown') AS mat_ecolor,
   inv.FC_server_code AS factory_code,
	CAST(ISNULL(manf.mo_sumqty, 0) AS INT) AS order_qty,
	ac.accumulated_qty,
	COUNT(DISTINCT inv.EPC_Code) AS daily_outbound_qty,
	(manf.mo_sumqty - COALESCE(ac.accumulated_qty, 0)) AS missing_qty
FROM datalist inv
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust match 
	ON inv.EPC_Code = match.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf 
	ON manf.mo_no = ISNULL(inv.mo_no, 'Unknown')
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod 
	ON match.mat_code = prod.mat_code
LEFT JOIN accumulated_counts ac
   ON ac.mo_no = inv.mo_no
WHERE CAST(inv.record_time AS DATE) = @0
GROUP BY 
   inv.mo_no,
   prod.mat_ecolor,
   manf.mo_sumqty,
   ac.accumulated_qty,
   match.shoestyle_codefactory,
   inv.FC_server_code
ORDER BY inv.mo_no DESC;