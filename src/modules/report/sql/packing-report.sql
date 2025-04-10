DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

WITH
   po_list AS (
      SELECT e.brand_name,
		IIF(ISNULL(a.or_custpoone,'') = '', a.or_custpo, a.or_custpoone)[PO], 
		COALESCE(c.shoestyle_codefactory, @FallbackValue)[shoes_style_code_factory], 
		COALESCE(b.mat_ecolor, @FallbackValue)[mat_ecolor], 
		(SUM(a.or_totalqty) - SUM(a.or_totalcqty))[po_qty]
      FROM wuerp_vnrd.dbo.ta_ordermst a
      LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON a.mat_code=b.mat_code AND b.isactive='Y'
		  LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive='Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor d ON b.shoestyle_templink=d.shoestyle_templink AND c.isactive='Y'
			LEFT JOIN wuerp_vnrd.dbo.ta_brand e ON a.custbrand_id=e.custbrand_id AND e.isactive='Y'
      WHERE a.isactive='Y'
      GROUP BY e.brand_name,
		IIF(ISNULL(a.or_custpoone,'')='', a.or_custpo, a.or_custpoone), 
		COALESCE(c.shoestyle_codefactory, @FallbackValue), 
		COALESCE(b.mat_ecolor, @FallbackValue)
   ),
weight_qty AS (
	SELECT 
		PO,
		Size,
		Series_number,
		SUM(CAST(REPLACE(SUBSTRING(Size, CHARINDEX('(', Size) + 1, CHARINDEX(')', Size) - CHARINDEX('(', Size) - 1), ',', '') AS INT))[weighed_item_qty]
	FROM DV_DATA_LAKE.dbo.PackingPlan
   GROUP BY PO, Size, Series_number
)
SELECT pl.brand_name[brand_name],
   pk.PO AS po, 
   pl.shoes_style_code_factory, 
   pl.mat_ecolor,
   pk.Size AS size_data,
   CAST(ISNULL(pl.po_qty, 0) AS INT) AS po_qty, 
   COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
   wt.weighed_item_qty,
   CAST(pl.po_qty - wt.weighed_item_qty AS INT) AS unweighed_item_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk
   LEFT JOIN weight_qty wt ON wt.PO = pk.PO AND wt.Size = pk.Size AND wt.Series_number = pk.Series_number 
   INNER JOIN po_list pl ON pk.PO = pl.PO
WHERE 
   CAST(pk.weighing_time AS DATE) = @0
   AND pk.Factory_code = CASE WHEN @1 = 'VA1' THEN 'GL1'
   WHEN @1 = 'VB2' THEN 'GL3'
   WHEN @1 = 'CA1' THEN 'GL4'
   ELSE pk.Factory_code END
GROUP BY pl.brand_name,
	pk.PO, 
	pl.shoes_style_code_factory, 
	pl.mat_ecolor,
	pk.Size,
	wt.weighed_item_qty,
	pk.Factory_code,
	pl.po_qty
ORDER BY pl.shoes_style_code_factory, pk.PO