
WITH
   po_list
   AS
   (
      SELECT e.brand_name,
		IIF(ISNULL(a.or_custpoone,'') = '', a.or_custpo, a.or_custpoone)[PO], 
		COALESCE(c.shoestyle_codefactory, 'Unknown')[shoes_style_code_factory], 
		COALESCE(b.mat_ecolor, 'Unknown')[mat_ecolor], 
		(SUM(a.or_totalqty) - SUM(a.or_totalcqty))[po_qty]
      FROM wuerp_vnrd.dbo.ta_ordermst a
      LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON a.mat_code=b.mat_code AND b.isactive='Y'
		  LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive='Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor d ON b.shoestyle_templink=d.shoestyle_templink AND c.isactive='Y'
			LEFT JOIN wuerp_vnrd.dbo.ta_brand e ON a.custbrand_id=e.custbrand_id AND e.isactive='Y'
      WHERE a.isactive='Y'
      GROUP BY e.brand_name,
		IIF(ISNULL(a.or_custpoone,'')='', a.or_custpo, a.or_custpoone), 
		COALESCE(c.shoestyle_codefactory, 'Unknown'), 
		COALESCE(b.mat_ecolor, 'Unknown')
   )
SELECT pl.brand_name[brand_name],
   pk.PO AS po, 
   pl.shoes_style_code_factory, 
   pl.mat_ecolor, 
   pk.Size AS size_data,
   ISNULL(pl.po_qty, 0) AS po_qty, 
   COUNT(DISTINCT Series_number) AS weighed_qty,
   (pl.po_qty - COUNT(DISTINCT Series_number)) AS unweighed_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk
   INNER JOIN po_list pl ON pk.PO = pl.PO
WHERE 
   CAST(pk.weighing_time AS DATE) = @0
   AND pk.Factory_code = @1
GROUP BY pl.brand_name,
	pk.PO, 
	pl.shoes_style_code_factory, 
	pl.mat_ecolor,
	pk.Size,
	pk.Factory_code,
	pl.po_qty
ORDER BY pl.shoes_style_code_factory, pk.PO