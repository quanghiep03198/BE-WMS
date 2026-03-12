WITH CurMonthOutboundCte AS (
   SELECT DISTINCT EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
   WHERE isactive = 'Y'
      AND po = @0
      AND mo_no = @1
      AND size_code = @2
      AND RIGHT(stationNO, 3) = '103'
      AND rfid_status = 'B'
      AND record_time >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
      AND record_time < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
   UNION
   SELECT DISTINCT EPC_Code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
   WHERE isactive = 'Y'
      AND po = @0
      AND mo_no = @1
      AND size_code = @2
      AND RIGHT(stationNO, 3) = '103'
      AND rfid_status = 'B'
      AND record_time >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
      AND record_time < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
),
OrderInfo AS (
   SELECT 
      h.custbrand_id,
      h.brand_name,
      a.cofactory_code,
      a.mo_no,
      a.mat_code,
      b.or_no,
      d.color_sn,
      e.shoestyle_codefactory,
      g.shoestyle_codecust,
      g.shoestyle_namecust,
      CAST(ISNULL(g.shoestyle_codecust, '') + '/' + ISNULL(g.shoestyle_namecust, '' ) AS NVARCHAR(255)) AS cust_shoestyle,
      s.size_numcode,
      s.size_qty
   FROM wuerp_vnrd.dbo.ta_manufacturmst a
      LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet b ON a.mo_no = b.mo_no AND b.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_ordermst c ON c.or_no = b.or_no AND c.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_productmst d ON d.mat_code = a.mat_code AND d.isactive= 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst e ON e.shoestyle_systemcodefty = d.shoestyle_systemcodefty AND e.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_ordersizerun f ON f.or_no = b.or_no AND f.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor g ON g.shoestyle_templink = d.shoestyle_templink AND g.isactive = 'Y'
      LEFT JOIN wuerp_vnrd.dbo.ta_brand h ON h.custbrand_id = d.custbrand_id
   OUTER APPLY (
   VALUES
      (f.[size_numcode01], f.[size_qty01]),
      (f.[size_numcode02], f.[size_qty02]),
      (f.[size_numcode03], f.[size_qty03]),
      (f.[size_numcode04], f.[size_qty04]),
      (f.[size_numcode05], f.[size_qty05]),
      (f.[size_numcode06], f.[size_qty06]),
      (f.[size_numcode07], f.[size_qty07]),
      (f.[size_numcode08], f.[size_qty08]),
      (f.[size_numcode09], f.[size_qty09]),
      (f.[size_numcode10], f.[size_qty10]),
      (f.[size_numcode11], f.[size_qty11]),
      (f.[size_numcode12], f.[size_qty12]),
      (f.[size_numcode13], f.[size_qty13]),
      (f.[size_numcode14], f.[size_qty14]),
      (f.[size_numcode15], f.[size_qty15]),
      (f.[size_numcode16], f.[size_qty16]),
      (f.[size_numcode17], f.[size_qty17]),
      (f.[size_numcode18], f.[size_qty18]),
      (f.[size_numcode19], f.[size_qty19]),
      (f.[size_numcode20], f.[size_qty20]),
      (f.[size_numcode21], f.[size_qty21]),
      (f.[size_numcode22], f.[size_qty22]),
      (f.[size_numcode23], f.[size_qty23]),
      (f.[size_numcode24], f.[size_qty24]),
      (f.[size_numcode25], f.[size_qty25]),
      (f.[size_numcode26], f.[size_qty26]),
      (f.[size_numcode27], f.[size_qty27]),
      (f.[size_numcode28], f.[size_qty28]),
      (f.[size_numcode29], f.[size_qty29]),
      (f.[size_numcode30], f.[size_qty30]),
      (f.[size_numcode31], f.[size_qty31]),
      (f.[size_numcode32], f.[size_qty32]),
      (f.[size_numcode33], f.[size_qty33]),
      (f.[size_numcode34], f.[size_qty34]),
      (f.[size_numcode35], f.[size_qty35]),
      (f.[size_numcode36], f.[size_qty36]),
      (f.[size_numcode37], f.[size_qty37]),
      (f.[size_numcode38], f.[size_qty38]),
      (f.[size_numcode39], f.[size_qty39]),
      (f.[size_numcode40], f.[size_qty40])
   ) s ([size_numcode],[size_qty])
   WHERE
      a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
      AND a.isactive = 'Y' 
      AND a.mo_no = @1
      AND s.size_numcode IN (
          STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               '0' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               'K' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               'T' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, '')
      )
      AND s.size_qty > 0
)
,
SourceCte AS (
   SELECT 
      MAX(custbrand_id) AS custbrand_id,
      MAX(brand_name) AS brand_name,
      MAX(cofactory_code) AS cofactory_code,
      mo_no,
      MAX(mat_code) AS mat_code,
      MAX(or_no) AS or_no,
      MAX(color_sn) AS color_sn,
      MAX(shoestyle_codefactory) AS shoestyle_cofactory,
      MAX(cust_shoestyle) AS cust_shoestyle,
      MAX(shoestyle_codecust) AS shoestyle_codecust,
      MAX(shoestyle_namecust) AS shoestyle_namecust,
      size_numcode,
      SUM(size_qty) AS mo_qty
   FROM OrderInfo
   GROUP BY mo_no, size_numcode
)
MERGE INTO DV_DATA_LAKE.dbo.dv_invprodmst AS Target
USING (
   SELECT a.*
      , @0 AS po
      , CONVERT(VARCHAR(6), GETDATE(), 112) AS inv_yearmonth
      , (SELECT COUNT(DISTINCT EPC_Code) FROM CurMonthOutboundCte) AS inv_ostotalqty
      , ISNULL(b.inv_finalqty, 0) AS inv_initialqty
   FROM SourceCte a
   OUTER APPLY (
         SELECT inv_finalqty
         FROM DV_DATA_LAKE.dbo.dv_invprodmst
         WHERE po = @0
            AND mo_no = @1
            AND size_numcode IN (
               STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               '0' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               'K' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
               'T' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, '')
            )
            AND inv_type = 'FG'
            AND inv_yearmonth =  CONVERT(VARCHAR(6), DATEADD(MONTH, -1, GETDATE()), 112)    
      ) b (inv_finalqty)
) AS Source
ON 
   Target.po = Source.po
   AND Target.mo_no = Source.mo_no
   AND Target.inv_yearmonth = Source.inv_yearmonth
   AND Target.inv_type = 'FG'
   AND Target.size_numcode IN (
      STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
      '0' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
      'K' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, ''),
      'T' + STUFF(@2, 1, PATINDEX('%[^0]%', @2) - 1, '')
   )
WHEN MATCHED THEN
   UPDATE SET 
      inv_initialqty = Source.inv_initialqty,
      inv_ostotalqty = Source.inv_ostotalqty,
      inv_finalqty = 
         Source.inv_initialqty
          + Target.inv_istotalqty 
          + Target.inv_manualqty 
          - Source.inv_ostotalqty 
          - Target.inv_manualqtyout
WHEN NOT MATCHED THEN
   INSERT (
      inv_type
      , inv_yearmonth
      , po
      , mo_no
      , or_no
      , cofactory_code
      , cofactory_code_mes
      , custbrand_id
      , brand_name
      , shoestyle_cofactory
      , cust_shoestyle
      , shoestyle_codecust
      , shoestyle_namecust
      , mo_qty
      , color_sn
      , size_numcode 
      , inv_initialqty
      , inv_istotalqty 
      , inv_ostotalqty
      , inv_manualqty
      , inv_manualqtyout
      , inv_finalqty)
   VALUES (
      'FG', -- inv_type
      Source.inv_yearmonth, 
      Source.po, 
      Source.mo_no, 
      Source.or_no,
      Source.cofactory_code,
      Source.cofactory_code,
      Source.custbrand_id,
      Source.brand_name,
      Source.shoestyle_cofactory,
      Source.cust_shoestyle,
      Source.shoestyle_codecust,
      Source.shoestyle_namecust,
      Source.mo_qty,
      Source.color_sn,
      Source.size_numcode, 
      Source.inv_initialqty, 
      0, -- inv_istotalqty
      Source.inv_ostotalqty, 
      0, -- inv_manualqty
      0, -- inv_manualqtyout
      Source.inv_initialqty - Source.inv_ostotalqty
   )
;