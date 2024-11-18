SELECT
	a.mo_no[mo_no],
	a.mat_code[mat_code],
	b.mo_noseq[mo_noseq],
	b.or_no[or_no],
	d.or_custpo[or_custpo],
	g.shoestyle_codefactory[shoestyle_codefactory],
	g.shoestyle_code[shoestyle_code],
	CAST(ISNULL(i.shoestyle_codecust,'') + '/' + ISNULL( i.shoestyle_namecust, '' ) AS nvarchar( 255 ))[cust_shoestyle],
	k.size_code,
	k.size_sumqty[size_qty]
FROM wuerp_vnrd.dbo.ta_manufacturmst a
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet b ON a.mo_no=b.mo_no AND b.isactive='Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_brand c ON c.custbrand_id = a.custbrand_id AND c.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordermst d ON d.or_no = b.or_no AND d.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_orderdet e ON e.or_no = d.or_no AND e.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst f ON f.mat_code= a.mat_code AND f.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst g ON g.shoestyle_systemcodefty = f.shoestyle_systemcodefty AND g.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordersizerun h ON h.or_no = b.or_no AND h.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor i ON i.shoestyle_templink = f.shoestyle_templink and i.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordersizerun k ON k.or_no = d.or_no AND k.isactive = 'Y'
WHERE a.mo_no = @0