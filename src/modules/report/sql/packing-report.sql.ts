export default /* SQL */ `
SELECT opr.brand AS brand_name,
   pk.PO AS po,
   opr.shoestyle_codefactory AS factory_shoes_style,
   opr.color_sn,
   pk.Size AS size_data,
   bq.target_box_qty,
   wq.target_item_qty,
   COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
   CAST(bq.target_box_qty - COUNT(DISTINCT pk.Series_number) AS INT) AS unweighed_box_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk
   INNER JOIN DV_DATA_LAKE.dbo.dv_OrderProcessR05 opr ON pk.PO = opr.PO
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
GROUP BY opr.brand,
	pk.PO, 
	opr.shoestyle_codefactory, 
	pk.Size,
	opr.color_sn,
	wq.target_item_qty,
	bq.target_box_qty,
	wb.weighed_box_qty
ORDER BY 
   pk.PO, 
   opr.shoestyle_codefactory, 
   opr.color_sn,
   CASE WHEN LEN(Size) >= 3 THEN 2 ELSE 0 END, LEFT(Size, 3)
OPTION (OPTIMIZE FOR UNKNOWN);
`
