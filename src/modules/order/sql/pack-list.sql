DECLARE @StartDate NVARCHAR(10) = @0;
DECLARE @EndDate NVARCHAR(10) = @1;
DECLARE @CustomerBrandName NVARCHAR(10) = @2;
DECLARE @FactoryCode NVARCHAR(10) = @3;

SELECT
   a.cofactory_code,
   b.brand_name,
   a.custbrand_id,
   a.kg_no,
   CAST (STUFF((	SELECT';' + md.mo_no+ ' - ' + md.mo_noseq
   FROM wuerp_vnrd.dbo.ta_packlistdet b
      LEFT JOIN wuerp_vnrd.dbo.ta_ordermst o ON o.isactive= 'Y'
         AND o.or_no= b.or_no
      LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet md ON md.isactive= 'Y'
         AND o.mo_templink= md.mo_templink
   WHERE b.isactive= 'Y'
      AND b.kg_no= a.kg_no
   FOR XML PATH ( '' ) ), 1, 1, '') AS NVARCHAR ( 255 ) ) AS mo_no,
   o.or_no,
   o1.or_custpo,
   ss.shoestyle_codefactory

FROM
   wuerp_vnrd.dbo.ta_packlistmst AS a
   LEFT JOIN wuerp_vnrd.dbo.ta_packlistdet o ON o.isactive= 'Y'
      AND a.kg_no= o.kg_no
   LEFT JOIN wuerp_vnrd.dbo.ta_ordermst o1 ON o1.isactive= 'Y'
      AND o.or_no= o1.or_no
   LEFT JOIN wuerp_vnrd.dbo.ta_productmst h ON h.isactive = 'Y'
      AND o1.mat_code = h.mat_code
   LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst ss ON ss.isactive= 'Y'
      AND h.shoestyle_systemcodefty = ss.shoestyle_systemcodefty
   LEFT JOIN wuerp_vnrd.dbo.ta_brand b ON b.isactive= 'Y'
      AND a.custbrand_id= b.custbrand_id
   LEFT JOIN wuerp_vnrd.dbo.ta_deliveryport dep ON dep.isactive= 'Y'
      AND a.dep_no= dep.dep_no

WHERE
	a.isactive= 'Y'
   AND a.kg_date >= @0
   AND a.kg_date < @1
   AND b.custbrand_id = @2
   AND a.cofactory_code = @3
ORDER BY
	b.brand_name ASC,
	a.kg_no DESC


-- SELECT
--     a.cofactory_code,
--     b.brand_name,
--     a.custbrand_id,
--     a.kg_no,
--     CAST(STUFF((
--         SELECT ';' + md.mo_no + ' - ' + md.mo_noseq
--         FROM wuerp_vnrd.dbo.ta_packlistdet b
--         LEFT JOIN wuerp_vnrd.dbo.ta_ordermst o ON o.isactive = 'Y' AND o.or_no = b.or_no
--         LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet md ON md.isactive = 'Y' AND o.mo_templink = md.mo_templink
--         WHERE b.isactive = 'Y' AND b.kg_no = a.kg_no
--         FOR XML PATH('')), 1, 1, '') AS NVARCHAR(255)) AS mo_no,
--     o.or_no,
--     o1.or_custpo,
--     ss.shoestyle_codefactory

-- FROM
--     wuerp_vnrd.dbo.ta_packlistmst a
--     LEFT JOIN wuerp_vnrd.dbo.ta_packlistdet o ON o.isactive = 'Y' AND a.kg_no = o.kg_no
--     LEFT JOIN wuerp_vnrd.dbo.ta_ordermst o1 ON o1.isactive = 'Y' AND o.or_no = o1.or_no
--     LEFT JOIN wuerp_vnrd.dbo.ta_productmst h ON h.isactive = 'Y' AND o1.mat_code = h.mat_code
--     LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst ss ON ss.isactive = 'Y' AND h.shoestyle_systemcodefty = ss.shoestyle_systemcodefty
--     LEFT JOIN wuerp_vnrd.dbo.ta_brand b ON b.isactive = 'Y' AND a.custbrand_id = b.custbrand_id
--     LEFT JOIN wuerp_vnrd.dbo.ta_deliveryport dep ON dep.isactive = 'Y' AND a.dep_no = dep.dep_no

-- WHERE
--     a.isactive = 'Y'
--     AND a.kg_date >= @StartDate
--     AND a.kg_date < @EndDate
--     AND b.custbrand_id = @CustomerBrandName
--     AND a.cofactory_code = @FactoryCode

-- ORDER BY
--     b.brand_name ASC,
--     a.kg_no DESC;




/*
	a.keyid,
	a.isactive,
	a.kg_date, --裝箱日期
	a.dep_no, --港口編號
	dep.dep_name,
	dep.dep_destination,
	a.type_export, --出貨方式
  a.status_outstore, --出庫狀態
	a.status_invoice, --發票狀態
	a.status_approve, --表單審核狀態
	a.kg_totalboxes, --箱數合計
	a.kg_totalqty, --數量合計
	a.kg_totalvolumn, --材積合計
	a.kg_totalnetweight, --淨重合計
	a.kg_totalgrossweight, --毛重合計
	a.dept_code, --建檔部門
	a.dept_name,  --建檔部門名稱
	a.employee_code, --建檔人員工編號
	a.employee_name, --建檔人姓名
	a.employee_code_approve,  --審核人員工編號
	a.employee_name_approve,  --審核人姓名
	a.approve_date, --審核日期
	( CASE WHEN a.user_name_updated IS NULL THEN a.user_name_created ELSE a.user_name_updated END ) AS user_name_updated,
	( CASE WHEN a.updated IS NULL THEN a.created ELSE a.updated END ) AS updated_date,
	CAST ( a.remark AS NVARCHAR ( 255 ) ) AS remark  --備註
*/