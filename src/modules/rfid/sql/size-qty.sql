-- GET ORDER SIZING GROUPED BY ORDER
DECLARE @IgnorePattern NVARCHAR(10);
SET @IgnorePattern = '303429%';
DECLARE @UnknownValue NVARCHAR(10);
SET @UnknownValue = 'Unknown';

WITH
	InvRFIDrecorddet AS (
		SELECT
			DISTINCT EPC_Code,
			ISNULL(ISNULL(mo_no_actual, mo_no), @UnknownValue) AS mo_no
		FROM
			DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
		WHERE
			EPC_Code NOT LIKE @IgnorePattern
			AND rfid_status IS NULL
			AND record_time >= FORMAT(GETDATE(), 'yyyy-MM-dd')
            AND mo_no NOT IN ('13D05B006')
	),
	rfidmatchmst_cust AS (
		SELECT
			DISTINCT EPC_Code,
			ISNULL(ISNULL(ma.mo_no_actual, mo_no), @UnknownValue) AS mo_no,
			ISNULL(size_numcode, @UnknownValue) AS size_numcode
		FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust ma
		WHERE EPC_Code NOT LIKE @IgnorePattern
        AND mo_no NOT IN ('13D05B006')
	)
SELECT
	ISNULL(ma.mo_no, @UnknownValue) AS mo_no,
	ISNULL(ma.size_numcode, @UnknownValue) AS size_numcode,
	COUNT(DISTINCT d.EPC_Code) AS count
FROM InvRFIDrecorddet d
LEFT JOIN rfidmatchmst_cust ma
    ON d.mo_no = ma.mo_no
    AND d.EPC_Code = ma.EPC_Code
GROUP BY ma.size_numcode, ma.mo_no
ORDER BY count DESC
-- END
;
