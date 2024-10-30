DECLARE @UnknownValue NVARCHAR(10) = 'Unknown';
DECLARE @InternalEpcPattern NVARCHAR(10) = 'E28%';

SELECT EPC_Code AS epc
FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
WHERE EPC_Code IN (
	SELECT cust1.EPC_Code
	FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust1, DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust2
	WHERE cust1.mo_no <> cust2.mo_no
		AND cust1.mat_code = cust2.mat_code
		AND COALESCE(cust1.mo_no_actual, cust1.mo_no) IN (SELECT TRIM(value) AS mo_no
		FROM STRING_SPLIT(@0, ','))
)
	AND EPC_Code NOT LIKE @InternalEpcPattern
	AND mo_no <> @1


