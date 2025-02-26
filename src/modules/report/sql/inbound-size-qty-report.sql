WITH datalist AS (
	SELECT EPC_Code, mo_no, record_time FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE rfid_status = 'A' AND stationNO LIKE 'CUS%WH10[12]'
	UNION ALL 
	SELECT EPC_Code, mo_no, record_time 
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
	WHERE rfid_status = 'A' AND stationNO LIKE 'CUS%WH10[12]'
)
SELECT ISNULL(size_numcode, 'Unknown')AS size_numcode, COUNT(DISTINCT i.EPC_Code) AS inbound_qty
	FROM datalist i 
	LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust c
	ON i.EPC_Code = c.EPC_Code
WHERE i.mo_no = @0 
   AND CAST(i.record_time AS DATE) = CAST(@1 AS DATE)
   AND i.EPC_Code NOT LIKE '303429%'
   AND i.EPC_Code NOT LIKE 'E28%'

GROUP BY i.mo_no, ISNULL(size_numcode, 'Unknown')
ORDER BY ISNULL(size_numcode, 'Unknown')