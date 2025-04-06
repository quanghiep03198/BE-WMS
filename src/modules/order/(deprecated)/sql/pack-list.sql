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