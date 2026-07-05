SELECT 
	h.brand_name,
	a.mo_no AS mo_no,
	a.mat_code AS mat_code,
	b.mo_noseq AS mo_noseq,
	b.or_no AS or_no,
	IIF(ISNULL(c.or_custpoone,'') = '',c.or_custpo,c.or_custpoone) AS or_cust_po,
	d.color_sn AS color_sn,
	e.shoestyle_codefactory AS factory_shoes_style,
	CAST(ISNULL(g.shoestyle_codecust, '') + '/' + ISNULL( g.shoestyle_namecust, '' ) AS NVARCHAR(255)) AS cust_shoes_style,
	f.size_code AS size_code,
	f.size_sumqty AS size_sumqty
FROM wuerp_vnrd.dbo.ta_manufacturmst a
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet b ON a.mo_no=b.mo_no AND b.isactive='Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordermst c ON c.or_no = b.or_no AND c.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst d ON d.mat_code= a.mat_code AND d.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst e ON e.shoestyle_systemcodefty = d.shoestyle_systemcodefty AND e.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordersizerun f ON f.or_no = b.or_no AND f.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor g ON g.shoestyle_templink = d.shoestyle_templink and g.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_brand h ON h.custbrand_id = d.custbrand_id
WHERE
	a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
	AND a.isactive = 'Y' 
	AND a.mo_no = @0
ORDER BY b.mo_noseq DESC, a.created DESC