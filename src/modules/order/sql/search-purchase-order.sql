WITH CTE AS (
   SELECT IIF(ISNULL(or_custpoone,'')='', or_custpo, or_custpoone)[po] 
   FROM wuerp_vnrd.dbo.ta_ordermst
   WHERE custbrand_id IN (
      SELECT custbrand_id FROM wuerp_vnrd.dbo.ta_brand WHERE brand_code IN ('TV','KB','UG')
   )
) 
SELECT TOP 5 po from CTE
WHERE po LIKE CONCAT('%', @0, '%')