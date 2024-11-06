SELECT
	a.mo_no AS mo_no,
	a.mo_noseq AS mo_noseq,
	a.or_no AS or_no,
	or1.or_custpo AS or_cust_po,
	d.shoestyle_codefactory AS shoes_style_code_factory,
	os.size_code AS size_code,
	k.cust_shoestyle1 AS cust_shoes_style,
	-- d.shoestyle_code AS cust_shoes_style,
	c.mat_code AS mat_code
FROM
	wuerp_vnrd.dbo.ta_manufacturdet AS a
	LEFT JOIN wuerp_vnrd.dbo.ta_ordermst or1 ON or1.or_no= a.or_no
		AND or1.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet manu ON manu.mo_templink= a.mo_templink_related
		AND manu.isactive= 'Y'
	LEFT JOIN (
		SELECT COUNT(a.or_qtypacking) AS or_qtypacking, a.or_no
		FROM wuerp_vnrd.dbo.ta_orderdet a
		WHERE a.isactive= 'Y'
		GROUP BY a.or_no
	) or2 ON or2.or_no = or1.or_no
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst a1 ON a1.mo_no= a.mo_no
		AND a1.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_brand b1 ON b1.custbrand_id= a1.custbrand_id
		AND b1.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst c ON c.mat_code= a1.mat_code
		AND c.isactive= 'Y'
	LEFT JOIN (
  SELECT CAST(ISNULL( shoestyle_codecust, '' ) + '/' + ISNULL( shoestyle_namecust, '' ) AS NVARCHAR ( 255 ) ) AS cust_shoestyle1, shoestyle_templink
	FROM wuerp_vnrd.dbo.ta_shoestylecolor
	WHERE isactive = 'Y' ) k ON k.shoestyle_templink= c.shoestyle_templink
	LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst d ON d.shoestyle_systemcodefty= c.shoestyle_systemcodefty
		AND d.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordersizerun os ON or2.or_no = os.or_no
		AND os.isactive= 'Y'
WHERE
  a.isactive= 'Y'
	AND a.mo_no = @0
ORDER BY
  a.mo_no,
  a.mo_noseq ASC