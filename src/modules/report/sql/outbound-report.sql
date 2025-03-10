WITH datalist AS (
   SELECT EPC_Code, mo_no, mo_no_actual, rfid_status, record_time, stationNO, FC_server_code, dept_name
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
   UNION ALL
   SELECT EPC_Code, mo_no, mo_no_actual, rfid_status, record_time, stationNO, FC_server_code, dept_name
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily 
),
accumulated_counts AS (
    SELECT mo_no, COUNT(DISTINCT EPC_Code) AS accumulated_qty
    FROM datalist
    WHERE 
        rfid_status = 'B'
        AND stationNO LIKE 'CUS%WH103'
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
	ON manf.mo_no = COALESCE(inv.mo_no_actual, inv.mo_no)
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod 
	ON match.mat_code = prod.mat_code
LEFT JOIN accumulated_counts ac
    ON ac.mo_no = inv.mo_no
WHERE
	inv.rfid_status = 'B'
	AND inv.stationNO LIKE 'CUS%WH103'
	AND inv.EPC_Code NOT LIKE '303429%' 
	AND inv.EPC_Code NOT LIKE 'E28%'
	AND COALESCE(inv.mo_no_actual, inv.mo_no) <> '13D05B006'
	AND CAST(inv.record_time AS DATE) = @0
GROUP BY 
   inv.mo_no,
   prod.mat_ecolor,
   manf.mo_sumqty,
   ac.accumulated_qty,
   match.shoestyle_codefactory,
   inv.FC_server_code
ORDER BY inv.mo_no DESC;