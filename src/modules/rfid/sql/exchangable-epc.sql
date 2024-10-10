DECLARE @UnknownValue NVARCHAR(10) = 'Unknown';
DECLARE @InternalEpcPattern NVARCHAR(10) = 'E28%';

WITH
    combined_datalist
    AS
    (
        SELECT
            inv.EPC_Code AS epc,
            COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) AS mo_no,
            cust.mat_code AS mat_code,
            ISNULL(cust.size_numcode,  @UnknownValue) AS size_numcode
        FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
            JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust
            ON inv.EPC_Code = cust.EPC_Code
                AND COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) = COALESCE(cust.mo_no_actual, cust.mo_no,  @UnknownValue)
        WHERE COALESCE(inv.mo_no_actual, inv.mo_no,  @UnknownValue) IN (@0, @1)
            AND inv.EPC_Code NOT LIKE @InternalEpcPattern
    )
SELECT DISTINCT d1.mo_no, d1.epc, d1.mat_code, d1.size_numcode
FROM combined_datalist d1
WHERE d1.mo_no = @0
    AND EXISTS (
    SELECT 1
    FROM combined_datalist d2
    WHERE d2.mo_no = @1
        AND d1.mat_code = d2.mat_code
)
ORDER BY d1.mat_code ASC;


