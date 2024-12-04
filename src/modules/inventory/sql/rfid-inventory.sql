DECLARE @FactoryCode NVARCHAR(10) = @0;
DECLARE @Month NVARCHAR(10) = @1;
DECLARE @BrandId NVARCHAR(10) = @2;

SELECT
	FORMAT(inv.record_time, 'yyyy-MM')[month],
	c.brand_name[cust_brand_name],
	a.mat_code[mat_code],
	g.shoestyle_codefactory[shoestyle_codefactory],
	ISNULL(d.or_custpoone, d.or_custpo)[or_custpo],
	d.or_totalqty-d.or_totalcqty [or_qty],
	COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown')[mo_no],
	b.mo_noseq[mo_noseq],
	COUNT(DISTINCT inv.EPC_Code)[total_epc_qty]
FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst a ON COALESCE(inv.mo_no_actual, inv.mo_no) = a.mo_no 
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet b ON a.mo_no=b.mo_no AND b.isactive='Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_brand c ON c.custbrand_id = a.custbrand_id AND c.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_ordermst d ON d.or_no = b.or_no AND d.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_orderdet e ON e.or_no = d.or_no AND e.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst f ON f.mat_code= a.mat_code AND f.isactive= 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst g ON g.shoestyle_systemcodefty = f.shoestyle_systemcodefty AND g.isactive = 'Y'
WHERE inv.rfid_status IS NOT NULL 
	AND FORMAT(inv.record_time, 'yyyy-MM') = @Month
	AND a.cofactory_code = @FactoryCode
	AND (@BrandId IS NULL OR c.custbrand_id = @BrandId)
GROUP BY 
	FORMAT(inv.record_time, 'yyyy-MM'),
	c.brand_name,
	ISNULL(d.or_custpoone, d.or_custpo),
	d.or_totalqty-d.or_totalcqty,
	b.or_no,
	COALESCE(inv.mo_no_actual, inv.mo_no, 'Unknown'),
	a.mat_code,
	g.shoestyle_codefactory,
	b.mo_noseq
ORDER BY FORMAT(inv.record_time, 'yyyy-MM') DESC, b.mo_noseq ASC