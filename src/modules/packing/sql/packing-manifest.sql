DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

-- Tối ưu factory mapping
DECLARE @TargetFactory NVARCHAR(10) = CASE 
   WHEN @0 = 'VA1' THEN 'GL1'
   WHEN @0 = 'VB2' THEN 'GL3'
   WHEN @0 = 'CA1' THEN 'GL4'
   ELSE @0 
END;

WITH packing_stats AS (
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
   pl.brand AS brand_name,
   pl.shoestyle_codefactory AS factory_shoes_style,
   pl.color_sn,
   pk.Size AS original_size_data,
   -- Extract only # items and format numbers (remove commas only within parentheses)
   CASE 
      WHEN CHARINDEX('#', pk.Size) > 0 THEN 
         (
            SELECT STRING_AGG(
               '#' + CASE 
                  WHEN CHARINDEX('(', LTRIM(RTRIM(value))) > 0 AND CHARINDEX(')', LTRIM(RTRIM(value))) > 0 THEN
                     REPLACE(LTRIM(RTRIM(value)), ',', '')
                  ELSE LTRIM(RTRIM(value))
               END,
               ';'
            )
            FROM STRING_SPLIT(
               SUBSTRING(pk.Size, CHARINDEX('#', pk.Size), LEN(pk.Size)), 
               '#'
            )
            WHERE LTRIM(RTRIM(value)) != ''
            AND LTRIM(RTRIM(value)) LIKE '%(%'
         )
      ELSE pk.Size
   END AS size_data,
   @0 AS factory_code_produce,
   ROUND(pk.Weight, 2) AS standard_weight,
   ROUND(AVG(pk.Actual_weight_in), 2) AS actual_avg_weight,
   ps.total_boxes AS target_box_qty,
   -- Calculate target_item_qty by parsing quantities from # sections
   (
      SELECT SUM(
         TRY_CAST(
            REPLACE(
               SUBSTRING(
                  value, 
                  CHARINDEX('(', value) + 1, 
                  CHARINDEX(')', value) - CHARINDEX('(', value) - 1
               ),
               ',', ''
            ) AS INT
         )
      )
      FROM (
         SELECT LTRIM(RTRIM(value)) as value
         FROM STRING_SPLIT(
            CASE 
               WHEN CHARINDEX('#', pk.Size) > 0 THEN 
                  SUBSTRING(pk.Size, CHARINDEX('#', pk.Size), LEN(pk.Size))
               ELSE pk.Size
            END, 
            '#'
         )
         WHERE LTRIM(RTRIM(value)) != ''
         AND CHARINDEX('(', value) > 0
         AND CHARINDEX(')', value) > 0
      ) AS hash_items
   ) AS target_item_qty,
   COUNT(DISTINCT pk.Series_number) AS weighed_box_qty,
   (ps.total_boxes - COUNT(DISTINCT pk.Series_number)) AS unweighed_box_qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk WITH(NOLOCK, INDEX(IX_PackingPlan_factory_po_size))
   INNER JOIN DV_DATA_LAKE.dbo.dv_OrderProcessR05 pl ON pk.po = pl.po
   INNER JOIN packing_stats ps ON pk.po = ps.po AND pk.Size = ps.Size
WHERE pk.Factory_code = @TargetFactory
AND pk.Size LIKE '%#%'
AND pk.Size LIKE '%(%'
AND pk.Size LIKE '%)%'
GROUP BY 
   CAST(pk.created AS DATE),
   pk.Factory_code,
   pl.brand,
   pk.po, 
   pl.shoestyle_codefactory,
   pk.Size,
   pl.color_sn,
   pk.Weight,
   -- pk.Actual_weight_in,
   ps.total_boxes
ORDER BY 
   CAST(pk.created AS DATE), 
   pk.po,
   LEFT(pk.Size, 3)
OPTION (OPTIMIZE FOR UNKNOWN);