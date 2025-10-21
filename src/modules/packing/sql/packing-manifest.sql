DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

-- Tối ưu factory mapping
DECLARE @TargetFactory NVARCHAR(10) = CASE 
   WHEN @0 = 'VA1' THEN 'GL1'
   WHEN @0 = 'VB2' THEN 'GL3'
   WHEN @0 = 'CA1' THEN 'GL4'
   ELSE @0 
END;


WITH po_aggregated AS (
   -- Optimize CTE with index hints
   SELECT 
      e.brand_name,
      COALESCE(NULLIF(a.or_custpoone, ''), a.or_custpo) AS po,
      COALESCE(c.shoestyle_codecust + '/' + c.shoestyle_codefactory, c.shoestyle_codefactory) AS shoes_style,
      b.color_sn + '/' + UPPER(b.mat_ecolor) AS color
   FROM wuerp_vnrd.dbo.ta_ordermst a WITH(NOLOCK, INDEX(IX_ordermst_active_matcode))
      LEFT JOIN wuerp_vnrd.dbo.ta_productmst b WITH(NOLOCK, INDEX(IX_productmst_matcode_active)) 
         ON a.mat_code = b.mat_code AND b.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c WITH(NOLOCK, INDEX(IX_shoefactory_systemcode_active)) 
         ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_brand e WITH(NOLOCK, INDEX(IX_brand_custbrand_active)) 
         ON a.custbrand_id = e.custbrand_id AND e.isactive = 'Y'
   WHERE a.isactive = 'Y'
   GROUP BY 
      e.brand_name,
      COALESCE(NULLIF(a.or_custpoone, ''), a.or_custpo),
      COALESCE(c.shoestyle_codecust + '/' + c.shoestyle_codefactory, c.shoestyle_codefactory),
      b.color_sn + '/' + UPPER(b.mat_ecolor)
),
packing_stats AS (
   -- Pre-aggregate packing statistics
   SELECT 
      po,
      Size,
      COUNT(DISTINCT Series_number) AS total_boxes,
      SUM(CASE WHEN Actual_weight_in IS NOT NULL THEN 1 ELSE 0 END) AS weighed_boxes
   FROM DV_DATA_LAKE.dbo.PackingPlan WITH(NOLOCK, INDEX(IX_PackingPlan_po_size_factory))
   WHERE Factory_code = @TargetFactory
   GROUP BY po, Size
)
SELECT 
   pk.po,
   pl.brand_name,
   pl.shoes_style,
   pl.color,
   pk.Size AS size_data,
   @0 AS factory_code_produce,
   pk.Weight AS standard_weight,
   pk.Actual_weight_in AS actual_weight,
   ps.total_boxes AS target_box_qty,
   -- Optimize calculate target_item_qty
   CASE 
      WHEN pk.Size LIKE '%(%' AND pk.Size LIKE '%)%'
      THEN TRY_CAST(REPLACE(SUBSTRING(pk.Size, CHARINDEX('(', pk.Size) + 1, 
           CHARINDEX(')', pk.Size) - CHARINDEX('(', pk.Size) - 1), ',', '') AS INT)
      ELSE 0
   END AS target_item_qty,
   COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
   (ps.total_boxes - COUNT(DISTINCT pk.Series_number)) AS unweighed_box_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk WITH(NOLOCK, INDEX(IX_PackingPlan_factory_po_size))
   INNER JOIN po_aggregated pl ON pk.po = pl.po
   INNER JOIN packing_stats ps ON pk.po = ps.po AND pk.Size = ps.Size
WHERE pk.Factory_code = @TargetFactory
AND CASE 
      WHEN pk.Size LIKE '%(%' AND pk.Size LIKE '%)%'
      THEN TRY_CAST(REPLACE(SUBSTRING(pk.Size, CHARINDEX('(', pk.Size) + 1, 
           CHARINDEX(')', pk.Size) - CHARINDEX('(', pk.Size) - 1), ',', '') AS INT)
      ELSE 0
   END <> '0'
GROUP BY 
   CAST(pk.created AS DATE),
   pk.Factory_code,
   pl.brand_name,
   pk.po, 
   pl.shoes_style, 
   pk.Size,
   pl.color,
   pk.Weight,
   pk.Actual_weight_in,
   ps.total_boxes
ORDER BY 
   CAST(pk.created AS DATE), 
   pk.po,
   pl.shoes_style, 
   pl.color,
   CASE WHEN LEN(pk.Size) >= 3 THEN 2 ELSE 0 END, 
   LEFT(pk.Size, 3)
OPTION (
   OPTIMIZE FOR UNKNOWN,
   USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),
   MAXDOP 4,
   RECOMPILE
);
