DECLARE @IgnorePattern NVARCHAR(10) = '303429%';
DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

WITH OrderSizesDetail AS (
    SELECT DISTINCT
        inv.EPC_Code,
        COALESCE(inv.mo_no_actual, inv.mo_no, @FallbackValue) AS mo_no,
        COALESCE(ma.mat_code, @FallbackValue) AS mat_code,
        ISNULL(ma.size_numcode, @FallbackValue) AS size_numcode
    FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
    LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust ma
        ON inv.EPC_Code = ma.EPC_Code
        AND COALESCE(inv.mo_no_actual, inv.mo_no, @FallbackValue) = COALESCE(ma.mo_no_actual, ma.mo_no, @FallbackValue)
    WHERE inv.EPC_Code NOT LIKE @IgnorePattern
        AND inv.rfid_status IS NULL
        AND inv.record_time >= CAST(GETDATE() AS DATE)  -- Optimized date comparison
        AND COALESCE(inv.mo_no_actual, inv.mo_no, @FallbackValue) NOT IN ('13D05B006')
        AND COALESCE(ma.mo_no_actual, ma.mo_no, @FallbackValue) NOT IN ('13D05B006')
)
SELECT
    mo_no,
    mat_code,
    size_numcode,
    COUNT(DISTINCT EPC_Code) AS count
FROM OrderSizesDetail
GROUP BY mo_no, mat_code, size_numcode
ORDER BY size_numcode ASC, mo_no ASC ;
