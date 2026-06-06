SELECT DISTINCT 
   brand_name, 
   CAST(ISNULL(shoestyle_codecust, '') + '/' + ISNULL( shoestyle_namecust, '' ) AS NVARCHAR(255)) AS cust_shoes_style, 
   shoestyle_codefactory AS factory_shoes_style, 
   JSON_QUERY(cl.product_variants) AS product_variants
FROM wuerp_vnrd.dbo.ta_shoefactorymst a
INNER JOIN wuerp_vnrd.dbo.ta_productmst b      
   ON a.shoestyle_systemcodefty = b.shoestyle_systemcodefty
      AND b.isactive = 'Y'
      AND b.color_sn IS NOT NULL
INNER JOIN wuerp_vnrd.dbo.ta_brand c
   ON 
      c.isactive = 'Y'
      AND c.custbrand_id = b.custbrand_id 
CROSS APPLY (
   SELECT (
   SELECT DISTINCT b.color_sn, JSON_QUERY(s.sizes) AS sizes
   FROM wuerp_vnrd.dbo.ta_productmst c
   CROSS APPLY ( 
      SELECT (
         SELECT 
            DISTINCT
            CASE
               -- If prefixed with T/K remove prefix then drop leading zero if next char is digit
               WHEN LEFT(sz.size_numcode, 1) IN ('T', 'K') THEN
                  CASE
                     WHEN LEFT(SUBSTRING(sz.size_numcode, 2, LEN(sz.size_numcode)), 1) = '0'
                        AND SUBSTRING(SUBSTRING(sz.size_numcode, 2, LEN(sz.size_numcode)), 2, 1) BETWEEN '0' AND '9'
                     THEN STUFF(SUBSTRING(sz.size_numcode, 2, LEN(sz.size_numcode)), 1, 1, '')
                     ELSE SUBSTRING(sz.size_numcode, 2, LEN(sz.size_numcode))
                  END
               -- If numeric and has leading zero (e.g. '05' or '05.5') drop the leading zero
               WHEN ISNUMERIC(sz.size_numcode) = 1 THEN
                  CASE
                     WHEN LEFT(CAST(sz.size_numcode AS NVARCHAR), 1) = '0'
                        AND SUBSTRING(CAST(sz.size_numcode AS NVARCHAR), 2, 1) BETWEEN '0' AND '9'
                     THEN STUFF(CAST(sz.size_numcode AS NVARCHAR), 1, 1, '')
                     ELSE CAST(sz.size_numcode AS NVARCHAR)
                  END
               ELSE CAST(sz.size_numcode AS NVARCHAR)
            END AS size
         FROM wuerp_vnrd.dbo.ta_productmst p
         INNER JOIN wuerp_vnrd.dbo.ta_manufacturmst m ON p.mat_code = m.mat_code AND m.isactive = 'Y'
         INNER JOIN wuerp_vnrd.dbo.ta_manufacturdet md ON md.mo_no = m.mo_no AND md.isactive = 'Y'
         INNER JOIN wuerp_vnrd.dbo.ta_ordersizerun os ON os.or_no = md.or_no AND os.isactive = 'Y'
         OUTER APPLY (
            VALUES
               ([size_numcode01], [size_qty01] - [size_qtycancel01]),
               ([size_numcode02], [size_qty02] - [size_qtycancel02]),
               ([size_numcode03], [size_qty03] - [size_qtycancel03]),
               ([size_numcode04], [size_qty04] - [size_qtycancel04]),
               ([size_numcode05], [size_qty05] - [size_qtycancel05]),
               ([size_numcode06], [size_qty06] - [size_qtycancel06]),
               ([size_numcode07], [size_qty07] - [size_qtycancel07]),
               ([size_numcode08], [size_qty08] - [size_qtycancel08]),
               ([size_numcode09], [size_qty09] - [size_qtycancel09]),
               ([size_numcode10], [size_qty10] - [size_qtycancel10]),
               ([size_numcode11], [size_qty11] - [size_qtycancel11]),
               ([size_numcode12], [size_qty12] - [size_qtycancel12]),
               ([size_numcode13], [size_qty13] - [size_qtycancel13]),
               ([size_numcode14], [size_qty14] - [size_qtycancel14]),
               ([size_numcode15], [size_qty15] - [size_qtycancel15]),
               ([size_numcode16], [size_qty16] - [size_qtycancel16]),
               ([size_numcode17], [size_qty17] - [size_qtycancel17]),
               ([size_numcode18], [size_qty18] - [size_qtycancel18]),
               ([size_numcode19], [size_qty19] - [size_qtycancel19]),
               ([size_numcode20], [size_qty20] - [size_qtycancel20]),
               ([size_numcode21], [size_qty21] - [size_qtycancel21]),
               ([size_numcode22], [size_qty22] - [size_qtycancel22]),
               ([size_numcode23], [size_qty23] - [size_qtycancel23]),
               ([size_numcode24], [size_qty24] - [size_qtycancel24]),
               ([size_numcode25], [size_qty25] - [size_qtycancel25]),
               ([size_numcode26], [size_qty26] - [size_qtycancel26]),
               ([size_numcode27], [size_qty27] - [size_qtycancel27]),
               ([size_numcode28], [size_qty28] - [size_qtycancel28]),
               ([size_numcode29], [size_qty29] - [size_qtycancel29]),
               ([size_numcode30], [size_qty30] - [size_qtycancel30]),
               ([size_numcode31], [size_qty31] - [size_qtycancel31]),
               ([size_numcode32], [size_qty32] - [size_qtycancel32]),
               ([size_numcode33], [size_qty33] - [size_qtycancel33]),
               ([size_numcode34], [size_qty34] - [size_qtycancel34]),
               ([size_numcode35], [size_qty35] - [size_qtycancel35]),
               ([size_numcode36], [size_qty36] - [size_qtycancel36]),
               ([size_numcode37], [size_qty37] - [size_qtycancel37]),
               ([size_numcode38], [size_qty38] - [size_qtycancel38]),
               ([size_numcode39], [size_qty39] - [size_qtycancel39]),
               ([size_numcode40], [size_qty40] - [size_qtycancel40])
         ) sz ([size_numcode],[size_qty])
         WHERE p.color_sn = b.color_sn  
            AND sz.size_numcode IS NOT NULL
            AND sz.size_qty > 0
            AND p.shoestyle_systemcodefty = a.shoestyle_systemcodefty
            -- AND m.created >= CAST(DATEADD(YEAR, -5, GETDATE()) AS DATE)
         FOR JSON PATH
      ) AS sizes
   ) s (sizes)
   WHERE 
      b.shoestyle_systemcodefty = a.shoestyle_systemcodefty 
      AND s.sizes IS NOT NULL
   FOR JSON PATH
   ) AS product_variants
) cl (product_variants)
WHERE a.isactive = 'Y' 
AND cl.product_variants IS NOT NULL 
and shoestyle_codecust IS NOT NULL
-- AND a.created >= CAST(DATEADD(YEAR, -5, GETDATE()) AS DATE)
AND c.brand_code IN ('UG', 'TV', 'KB') 
ORDER BY brand_name ASC
OPTION (
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE')    -- * Prioritize parallel plan
   -- KEEPFIXED PLAN
);