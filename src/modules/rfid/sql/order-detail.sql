DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

SELECT COALESCE(mo_no, @FallbackValue) AS mo_no,  
   COALESCE(mat_code, @FallbackValue) AS mat_code,
   COALESCE(shoestyle_codefactory, @FallbackValue) AS shoes_style_code_factory,
   COALESCE(size_numcode, @FallbackValue) AS size_numcode,
   COUNT(EPC_Code) as count
FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
WHERE EPC_Code IN (
      SELECT value as EPC_Code 
      FROM STRING_SPLIT(@0, ',')
   )
GROUP BY 
   ISNULL(mo_no, @FallbackValue),
   COALESCE(mat_code, @FallbackValue),
   COALESCE(shoestyle_codefactory, @FallbackValue) ,
   COALESCE(size_numcode, @FallbackValue)
ORDER BY mat_code ASC, 
	shoes_style_code_factory  ASC, 
	size_numcode ASC, 
	mo_no ASC