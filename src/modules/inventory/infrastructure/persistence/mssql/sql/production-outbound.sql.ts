export default /* SQL */ `
SELECT 
	DISTINCT po, 
	po_qty, 
	outbound_qty, 
	outbound_date, 
	inv_sizes  
FROM DV_DATA_LAKE.dbo.dvview_invoub WITH(NOLOCK)
WHERE 
   inv_sizes IS NOT NULL
	AND inv_sizes <> 'NULL'
   AND (@0 = 'ALL' OR brand_name = @0)
   AND (@1 = 'ALL' OR shoes_style = @1) 
   AND (@2 = 'ALL' OR color = @2) 
OPTION (
   OPTIMIZE FOR (@1 = 'ALL', @2 = 'ALL'), 
	RECOMPILE																	-- * Re-optimize for each execution
)

`
