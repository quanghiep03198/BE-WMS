-- GET ORDER LIST
DECLARE @IgnorePattern NVARCHAR(10);
SET @IgnorePattern = '303429%';
DECLARE @UnknownValue NVARCHAR(10);
SET @UnknownValue = 'Unknown';
WITH
	datalist
	AS
	(
		SELECT
			DISTINCT EPC_Code,
			ISNULL(ISNULL(mo_no_actual, mo_no), @UnknownValue) AS mo_no
		FROM
			DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet 
		WHERE
		EPC_Code NOT LIKE '303429%'
			AND rfid_status IS NULL
			AND record_time >= FORMAT(GETDATE(), 'yyyy-MM-dd')
			AND mo_no NOT IN ('13D05B006')
	)
SELECT
	mo_no,
	COUNT(DISTINCT EPC_Code) as count
FROM datalist 
GROUP BY mo_no
ORDER BY count DESC
