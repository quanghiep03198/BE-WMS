WITH datalist AS (
	SELECT EPC_Code, mo_no, created, FC_server_code, stationNO FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE 
		rfid_status = 'A' 
		AND mo_no = @0 
		AND FC_server_code = @1
		AND CAST(created AS DATE) = CAST(@2 AS DATE)
		AND stationNO LIKE 'CUS%WH10[12]'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
	UNION ALL 
	SELECT EPC_Code, mo_no, created, FC_server_code, stationNO 
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
		WHERE rfid_status = 'A' 
		AND mo_no = @0 
		AND FC_server_code = @1
		AND CAST(created AS DATE) = CAST(@2 AS DATE)
		AND stationNO LIKE 'CUS%WH10[12]'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
)
SELECT 
	ISNULL(c.size_numcode, 'Unknown') AS size_numcode, 
	COUNT(DISTINCT d.EPC_Code) AS qty
FROM datalist d 
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust c
	ON d.EPC_Code = c.EPC_Code
GROUP BY d.mo_no, ISNULL(c.size_numcode, 'Unknown'), d.FC_server_code, d.stationNO
ORDER BY ISNULL(size_numcode, 'Unknown')