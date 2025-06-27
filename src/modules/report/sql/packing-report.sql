DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

WITH
   po_list
   AS
   (
      SELECT e.brand_name,
         IIF(ISNULL(a.or_custpoone,'') = '', a.or_custpo, a.or_custpoone)[PO],
         COALESCE(c.shoestyle_codefactory, @FallbackValue)[shoes_style_code_factory],
         COALESCE(b.color_sn, @FallbackValue)[color_sn]
      FROM wuerp_vnrd.dbo.ta_ordermst a
         LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON a.mat_code = b.mat_code AND b.isactive='Y'
         LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive='Y'
         LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor d ON b.shoestyle_templink = d.shoestyle_templink AND c.isactive='Y'
         LEFT JOIN wuerp_vnrd.dbo.ta_brand e ON a.custbrand_id = e.custbrand_id AND e.isactive='Y'
      WHERE a.isactive='Y'
      GROUP BY e.brand_name,
      IIF(ISNULL(a.or_custpoone,'') = '', a.or_custpo, a.or_custpoone), 
      COALESCE(c.shoestyle_codefactory, @FallbackValue), 
      COALESCE(b.color_sn, @FallbackValue)
   )
SELECT pl.brand_name[brand_name],
   pk.PO AS po,
   pl.shoes_style_code_factory,
   pl.color_sn,
   pk.Size AS size_data,
   bq.target_box_qty,
   wq.target_item_qty,
   COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
   CAST(bq.target_box_qty - COUNT(DISTINCT pk.Series_number) AS INT) AS unweighed_box_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk
   INNER JOIN po_list pl ON pk.PO = pl.PO
OUTER APPLY (
	SELECT COUNT(DISTINCT p.Series_number) AS target_box_qty
   FROM DV_DATA_LAKE.dbo.PackingPlan p
   WHERE p.PO = pk.PO AND p.Size = pk.Size
) bq -- * Total boxes grouped by PO & Size (both weighed and unweighed)
OUTER APPLY (
	
   SELECT
      SUM(
         TRY_CAST(
            CASE 
               WHEN CHARINDEX('(', s.value) > 0 AND CHARINDEX(')', s.value) > CHARINDEX('(', s.value)
               THEN REPLACE(
                  SUBSTRING(
                     s.value, 
                     CHARINDEX('(', s.value) + 1, 
                     CHARINDEX(')', s.value) - CHARINDEX('(', s.value) - 1
                  ), 
                  ',', ''
               )
               ELSE '0'
            END AS INT
         )
      ) AS target_item_qty
   FROM STRING_SPLIT(Size, ',') AS s
) wq -- * Total quantity of weighing items
OUTER APPLY (
	SELECT COUNT(DISTINCT p.Series_number) AS weighed_box_qty
   FROM DV_DATA_LAKE.dbo.PackingPlan p
   WHERE p.PO = pk.PO AND CAST(p.weighing_time AS DATE) = @0 
) wb
-- * Total weighed boxes in the target day
WHERE 
   CAST(pk.weighing_time AS DATE) = CAST(@0 AS DATE)
   AND pk.Factory_code = CASE WHEN @1 = 'VA1' THEN 'GL1'
   WHEN @1 = 'VB2' THEN 'GL3'
   WHEN @1 = 'CA1' THEN 'GL4'
   ELSE pk.Factory_code END
GROUP BY pl.brand_name,
	pk.PO, 
	pl.shoes_style_code_factory, 
	pk.Size,
	pl.color_sn,
	wq.target_item_qty,
	bq.target_box_qty,
	wb.weighed_box_qty
ORDER BY 
   pk.PO, 
   pl.shoes_style_code_factory, 
   pl.color_sn,
   CASE WHEN LEN(Size) >= 3 THEN 2 ELSE 0 END, LEFT(Size, 3)
OPTION (OPTIMIZE FOR UNKNOWN);