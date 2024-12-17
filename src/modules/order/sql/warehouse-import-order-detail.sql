SELECT
	brand.brand_name,
	whiod.mo_no,
	orderm.or_custpoone,
	shoef.shoestyle_codefactory,
	orderm.or_deliverdate_confirm,
	whiod.sno_boxqty,
	whiod.sno_qty,
	whiom.sno_location,
	whiod.is_bgrade,
	whiod.employee_name,
	whiod.remark,
	CONVERT(varchar, ISNULL(whiod.updated, whiod.created), 105)updated_time,
	whiod.remark
FROM
	dv_whiodet whiod
LEFT JOIN dv_whiomst whiom ON
	whiod.sno_no = whiom.sno_no
	AND whiom.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_brand brand ON
	brand.custbrand_id = whiod.custbrand_id
	AND brand.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_ordermst orderm ON
	orderm.mo_templink = whiod.mo_templink
	AND orderm.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prodm ON
	prodm.mat_code = orderm.mat_code
	AND prodm.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst shoef ON
	shoef.shoestyle_systemcodefty = prodm.shoestyle_systemcodefty
	AND shoef.isactive = 'Y'
WHERE
	whiod.isactive = 'Y'
	AND whiod.sno_no = @0;
