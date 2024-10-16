DECLARE @UnknownValue NVARCHAR(10) = 'Unknown';
DECLARE @InternalEpcPattern NVARCHAR(10) = 'E28%';

SELECT EPC_Code AS epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
WHERE EPC_Code IN (
	SELECT cust1.EPC_Code FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust1,  DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust2
	WHERE cust1.mo_no <> cust2.mo_no
	AND cust1.mat_code = cust2.mat_code
	AND cust1.mo_no IN ( SELECT TRIM(value) AS mo_no
        FROM STRING_SPLIT(@0, ','))
)
AND EPC_Code NOT LIKE @InternalEpcPattern 
AND mo_no <> @1

-- WITH split_mo_no AS 
--     (
--         SELECT TRIM(value) AS mo_no
--         FROM STRING_SPLIT(@0, ',')
--     ),
--     combined_datalist AS
--     (
--         SELECT
--             inv.EPC_Code AS epc,
--             COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) AS mo_no,
--             cust.mat_code AS mat_code,
--             ISNULL(cust.size_numcode,  @UnknownValue) AS size_numcode
--         FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
--             JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust
--             ON inv.EPC_Code = cust.EPC_Code
--                 AND COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) = COALESCE(cust.mo_no_actual, cust.mo_no,  @UnknownValue)
--         WHERE (
--                 COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) IN (SELECT mo_no FROM split_mo_no)
--                 OR COALESCE(inv.mo_no_actual, inv.mo_no, @UnknownValue) = @1
--             ) AND inv.EPC_Code NOT LIKE @InternalEpcPattern
--     )
-- SELECT DISTINCT d1.mo_no, d1.epc, d1.mat_code, d1.size_numcode
-- FROM combined_datalist d1
-- WHERE d1.mo_no IN (SELECT mo_no FROM split_mo_no)
--     AND EXISTS (
--     SELECT 1
--     FROM combined_datalist d2
--     WHERE d2.mo_no = @1
--         AND d1.mat_code = d2.mat_code
-- )
-- ORDER BY d1.mat_code ASC;


