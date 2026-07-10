export default /* SQL */ `
DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

SELECT DISTINCT a.EPC_Code AS epc, 
   ISNULL(b.mo_no, @FallbackValue) AS mo_no,
   COALESCE(b.shoestyle_codefactory, @FallbackValue) AS factory_shoes_style,
   COALESCE(c.color_sn, @FallbackValue) AS color_sn,
   COALESCE(b.size_numcode, @FallbackValue) AS size_numcode,
   b.factory_code_produce
FROM (SELECT value AS EPC_Code FROM STRING_SPLIT(CAST(@0 AS NVARCHAR(MAX)), ',')) AS a
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust b ON a.EPC_Code = b.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_productmst c ON b.mat_code = c.mat_code
WHERE 
   a.EPC_Code NOT LIKE '303429%'
   AND LEN(a.EPC_Code) = 24
   AND (
      b.mo_no IS NULL 
      OR b.mo_no NOT IN (SELECT value AS mo_no FROM STRING_SPLIT(@1, ','))
   )
`
