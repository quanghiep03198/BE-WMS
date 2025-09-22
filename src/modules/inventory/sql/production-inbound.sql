SELECT DISTINCT mo_no,
   mo_qty, 
   inbound_qty, 
   inspected_qty,
   last_inbound_time, 
   inv_sizes  
FROM DV_DATA_LAKE.dbo.dvview_invinb WITH(NOLOCK)
WHERE 
   inv_sizes IS NOT NULL
	AND inv_sizes <> 'NULL'
   AND (@0 = 'ALL' OR brand_name = @0)
   AND (@1 = 'ALL' OR shoes_style = @1) 
   AND (@2 = 'ALL' OR color = @2) 
OPTION (
   OPTIMIZE FOR UNKNOWN, 
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),        		-- * Prioritize parallel execution plans
	QUERYTRACEON 2371,                                			-- * Enable automatic statistics updates for large tables
	QUERYTRACEON 4199,                                			-- * Enable all query optimizer fixes
	QUERYTRACEON 4138,                                			-- * Enable batch mode for rowstore (SQL 2019+)
	RECOMPILE																-- * Re-optimize for each execution						
)
