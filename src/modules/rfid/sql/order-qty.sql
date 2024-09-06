-- GET ORDER LIST
DECLARE @IgnorePattern NVARCHAR(10);
SET @IgnorePattern = '303429%';
DECLARE @UnknownValue NVARCHAR(10);
SET @UnknownValue = 'Unknown';
WITH datalist AS (
	SELECT
		DISTINCT d.EPC_Code,
		ISNULL(ISNULL(d.mo_no_actual, d.mo_no), @UnknownValue) AS mo_no
	FROM
		DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet d
	WHERE
		d.EPC_Code NOT LIKE '303429%'
		AND d.rfid_status IS NULL
		AND d.record_time >= FORMAT(GETDATE(), 'yyyy-MM-dd')
        AND d.mo_no NOT IN ('13D05B006')
)
SELECT
	mo_no,
	COUNT(DISTINCT EPC_Code) as count
FROM datalist d
GROUP BY mo_no
ORDER BY count DESC
