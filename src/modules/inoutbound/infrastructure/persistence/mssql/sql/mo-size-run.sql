WITH mo_size_source AS (
	SELECT
		t.mo_no,
		REPLACE(
			TRANSLATE(
				UPPER(msr.size_numcode), 
				'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 
				'                          '
			),
				' ',
				''
		) AS size_numcode
	FROM wuerp_vnrd.dbo.ta_manufactursizerun t
	CROSS APPLY (
	VALUES
		([size_numcode01], [size_qty01]),
		([size_numcode02], [size_qty02]),
		([size_numcode03], [size_qty03]),
		([size_numcode04], [size_qty04]),
		([size_numcode05], [size_qty05]),
		([size_numcode06], [size_qty06]),
		([size_numcode07], [size_qty07]),
		([size_numcode08], [size_qty08]),
		([size_numcode09], [size_qty09]),
		([size_numcode10], [size_qty10]),
		([size_numcode11], [size_qty11]),
		([size_numcode12], [size_qty12]),
		([size_numcode13], [size_qty13]),
		([size_numcode14], [size_qty14]),
		([size_numcode15], [size_qty15]),
		([size_numcode16], [size_qty16]),
		([size_numcode17], [size_qty17]),
		([size_numcode18], [size_qty18]),
		([size_numcode19], [size_qty19]),
		([size_numcode20], [size_qty20]),
		([size_numcode21], [size_qty21]),
		([size_numcode22], [size_qty22]),
		([size_numcode23], [size_qty23]),
		([size_numcode24], [size_qty24]),
		([size_numcode25], [size_qty25]),
		([size_numcode26], [size_qty26]),
		([size_numcode27], [size_qty27]),
		([size_numcode28], [size_qty28]),
		([size_numcode29], [size_qty29]),
		([size_numcode30], [size_qty30]),
		([size_numcode31], [size_qty31]),
		([size_numcode32], [size_qty32]),
		([size_numcode33], [size_qty33]),
		([size_numcode34], [size_qty34]),
		([size_numcode35], [size_qty35]),
		([size_numcode36], [size_qty36]),
		([size_numcode37], [size_qty37]),
		([size_numcode38], [size_qty38]),
		([size_numcode39], [size_qty39]),
		([size_numcode40], [size_qty40])
	) msr ([size_numcode], [size_qty])
	WHERE t.mo_no = @0
		AND msr.size_qty > 0
		AND msr.size_numcode IS NOT NULL
)
, mo_size_json AS (
	SELECT
		d.mo_no,
		CONCAT(
			'[',
			STRING_AGG(
				CONCAT('"', STRING_ESCAPE(CAST(d.size_numcode AS NVARCHAR(50)), 'json'), '"'),
				','
			) WITHIN GROUP (ORDER BY TRY_CAST(d.size_numcode AS FLOAT) ASC, d.size_numcode ASC),
			']'
		) AS mo_size_run
	FROM (
		SELECT DISTINCT mo_no, size_numcode
		FROM mo_size_source
	) d
	GROUP BY d.mo_no
)
SELECT 
	a.mo_no AS mo_no,
	aa.mo_noseq AS mo_noseq,
	aa.or_no AS or_no,
	e.or_custpo AS or_custpo,
	d.brand_name AS brand_name,
	c.shoestyle_codefactory AS factory_shoes_style,
	CONCAT(c.shoestyle_codecust, '/', c.shoestyle_namecust) AS cust_shoes_style,
	b.mat_code AS mat_code,
	b.color_sn AS color_sn,
   ISNULL(msj.mo_size_run, '[]') AS sizes
FROM wuerp_vnrd.dbo.ta_manufacturmst a
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet aa ON aa.mo_no = a.mo_no AND aa.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON b.mat_code= a.mat_code AND b.isactive= 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_brand d ON d.custbrand_id = b.custbrand_id
LEFT JOIN wuerp_vnrd.dbo.ta_ordermst e ON e.or_no = aa.or_no AND e.isactive = 'Y'
LEFT JOIN mo_size_json msj ON msj.mo_no = a.mo_no
WHERE
	a.mo_no = @0
	AND aa.mo_noseq = ISNULL(@1, '001')
	AND a.isactive = 'Y'
ORDER BY aa.mo_noseq;
