DECLARE @Epcs NVARCHAR(MAX) = @0;
DECLARE @ManufactureOrders NVARCHAR(MAX) = @1;

SELECT COALESCE(mo_no_actual, mo_no, 'Unknown') AS mo_no,  
   COALESCE(mat_code, 'Unknown') AS mat_code,
   COALESCE(shoestyle_codefactory, 'Unknown') AS shoes_style_code_factory ,
   COALESCE(size_numcode, 'Unknown') AS size_numcode,
   COUNT(DISTINCT EPC_Code) as count
FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
WHERE 
   EPC_Code NOT LIKE '303429%'
   AND EPC_Code IN (
      SELECT value as EPC_Code 
      FROM STRING_SPLIT(@Epcs, ',')
   )
   AND mo_no NOT IN (
      SELECT value as mo_no 
      FROM STRING_SPLIT(@ManufactureOrders, ',')
   )
GROUP BY 
   COALESCE(mo_no_actual, mo_no, 'Unknown'),
   COALESCE(mat_code, 'Unknown'),
   COALESCE(shoestyle_codefactory, 'Unknown') ,
   COALESCE(size_numcode, 'Unknown')
ORDER BY mat_code ASC, 
	shoes_style_code_factory  ASC, 
	size_numcode ASC, 
	mo_no ASC