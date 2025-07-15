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
   OPTIMIZE FOR UNKNOWN, 
	NO_PERFORMANCE_SPOOL,                             			-- * Disable performance spool operators                          			
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),        		-- * Prioritize parallel execution plans
	QUERYTRACEON 2371,                                			-- * Enable automatic statistics updates for large tables
	QUERYTRACEON 4199,                                			-- * Enable all query optimizer fixes
	QUERYTRACEON 4138,                                			-- * Enable batch mode for rowstore (SQL 2019+)
	MAXRECURSION 0,                                   			-- * No recursion limit
	FAST 100,                                         		   -- * Optimize for first 100 rows
	MAXDOP 4,                                         			-- * Use server's max degree of parallelism
	ROBUST PLAN,                                      			-- * Generate robust plan for memory grant
	RECOMPILE                                         			-- * Re-optimize for each execution
)
