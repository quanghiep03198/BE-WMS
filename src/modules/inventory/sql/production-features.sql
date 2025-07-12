SELECT 
	brand_name,
	(
		SELECT 
			shoes_style,
			(
					SELECT color
					FROM DV_DATA_LAKE.dbo.dvview_invtot CTE3
					WHERE (CTE3.shoes_style = CTE2.shoes_style)
					GROUP BY color
					FOR JSON PATH
			) AS colors
		FROM DV_DATA_LAKE.dbo.dvview_invtot CTE2
		WHERE CTE2.brand_name = CTE1.brand_name OR CTE1.brand_name = 'ALL'
		GROUP BY shoes_style
		FOR JSON PATH
	) AS product_variants
FROM DV_DATA_LAKE.dbo.dvview_invtot CTE1
GROUP BY brand_name
OPTION (
	OPTIMIZE FOR UNKNOWN,
	NO_PERFORMANCE_SPOOL,
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),
	MAXRECURSION 0,
	HASH GROUP,
	MAXDOP 4
);


