DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

-- Retrieves outbound report data for a specific date, including details about shoes, colors, and sizes.
WITH filtered_data AS (
   SELECT 
      i.EPC_Code, 
      i.po, 
      i.mo_no, 
      i.size_code, 
      i.record_time,
      r.shoestyle_codefactory, 
      p.mat_ecolor,
      i.FC_server_code
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily i WITH (NOLOCK)
   INNER JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust r WITH (NOLOCK)
      ON i.EPC_Code = r.EPC_Code
   INNER JOIN wuerp_vnrd.dbo.ta_productmst p WITH (NOLOCK)
      ON p.mat_code = r.mat_code AND p.isactive = 'Y'
   WHERE
      i.rfid_status = 'B'
      AND i.EPC_Code NOT LIKE '303429%'
      AND i.EPC_Code NOT LIKE 'E28%'
      AND i.mo_no <> '13D05B006'
      AND i.stationNO LIKE 'CUS%WH103'
      AND i.po IS NOT NULL
      AND CAST(i.record_time AS DATE) = @0
),
purchase_order_sizes AS (
   SELECT 
      IIF(ISNULL(or1.or_custpoone, '') = '', or1.or_custpo, or1.or_custpoone) AS po,
      CASE 
         WHEN ISNUMERIC(b.size_numcode) = 1 THEN CAST(b.size_numcode AS FLOAT) 
         WHEN LEFT(b.size_numcode, 1) IN ('T', 'K') THEN CAST(SUBSTRING(b.size_numcode, 2, LEN(b.size_numcode)) AS FLOAT)
      END AS [size_numcode], 
   SUM(CAST(b.size_qty AS INT)) AS qty
   FROM wuerp_vnrd.dbo.ta_ordersizerun a
   LEFT JOIN wuerp_vnrd.dbo.ta_ordermst or1 ON or1.or_no = a.or_no
      AND or1.isactive= 'Y'
   OUTER APPLY (
   VALUES
      ([size_numcode01], [size_qty01]),
      ([size_numcode02], [size_qty02]),
      ([size_numcode03], [size_qty03]),
      ([size_numcode04], [size_qty04]),
      ([size_numcode05], [size_qty05]),
      ([size_numcode06], [size_qty06]),
      ([size_numcode07], [size_qty07]),
      ([size_numcode08], [size_qty08]),
      ([size_numcode09], [size_qty09]),
      ([size_numcode10], [size_qty10]),
      ([size_numcode11], [size_qty11]),
      ([size_numcode12], [size_qty12]),
      ([size_numcode13], [size_qty13]),
      ([size_numcode14], [size_qty14]),
      ([size_numcode15], [size_qty15]),
      ([size_numcode16], [size_qty16]),
      ([size_numcode17], [size_qty17]),
      ([size_numcode18], [size_qty18]),
      ([size_numcode19], [size_qty19]),
      ([size_numcode20], [size_qty20]),
      ([size_numcode21], [size_qty21]),
      ([size_numcode22], [size_qty22]),
      ([size_numcode23], [size_qty23]),
      ([size_numcode24], [size_qty24]),
      ([size_numcode25], [size_qty25]),
      ([size_numcode26], [size_qty26]),
      ([size_numcode27], [size_qty27]),
      ([size_numcode28], [size_qty28]),
      ([size_numcode29], [size_qty29]),
      ([size_numcode30], [size_qty30]),
      ([size_numcode31], [size_qty31]),
      ([size_numcode32], [size_qty32]),
      ([size_numcode33], [size_qty33]),
      ([size_numcode34], [size_qty34]),
      ([size_numcode35], [size_qty35]),
      ([size_numcode36], [size_qty36]),
      ([size_numcode37], [size_qty37]),
      ([size_numcode38], [size_qty38]),
      ([size_numcode39], [size_qty39]),
      ([size_numcode40], [size_qty40])
   ) b (
   [size_numcode],[size_qty]
   )
   WHERE b.size_qty <> 0
   AND a.isactive= 'Y'
   GROUP BY IIF(ISNULL(or1.or_custpoone, '') = '', or1.or_custpo, or1.or_custpoone), a.size_code, b.size_numcode
),
-- Accumulated quantity calculation
accumulated_qty AS (
   SELECT 
      po,
      COUNT(DISTINCT EPC_Code) AS accumulated_qty
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
   WHERE
      rfid_status = 'B'
      AND EPC_Code NOT LIKE '303429%'
      AND EPC_Code NOT LIKE 'E28%'
      AND mo_no <> '13D05B006'
      AND stationNO LIKE 'CUS%WH103'
      AND po IS NOT NULL
   GROUP BY po
),
daily_productivity AS (
   SELECT 
      po,
      size_code,
      COUNT(DISTINCT EPC_Code) AS accumulated_qty
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
   WHERE
      rfid_status = 'B'
      AND EPC_Code NOT LIKE '303429%'
      AND EPC_Code NOT LIKE 'E28%'
      AND mo_no <> '13D05B006'
      AND stationNO LIKE 'CUS%WH103'
      AND po IS NOT NULL
      AND CAST(record_time AS DATE) = @0
   GROUP BY po, size_code
),
-- Purchase order information
order_info AS (
   SELECT
      IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po,
      CAST(SUM(a.or_totalqty) - SUM(a.or_totalcqty) AS INT) AS po_qty
   FROM wuerp_vnrd.dbo.ta_ordermst a WITH (NOLOCK)
   WHERE a.isactive = 'Y'
   GROUP BY IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)
),
-- Size quantity details
size_details AS (
   SELECT
      fd.po,
      fd.mo_no,
      fd.shoestyle_codefactory,
      fd.mat_ecolor,
      fd.size_code,
      COUNT(DISTINCT fd.EPC_Code) AS qty
   FROM filtered_data fd
   GROUP BY 
      fd.po, fd.mo_no, fd.shoestyle_codefactory, 
      fd.mat_ecolor, fd.size_code
)
-- Main query with JSON output
SELECT
   fd.po,
   COALESCE(fd.shoestyle_codefactory, @FallbackValue) AS shoes_style_code_factory,
   COALESCE(fd.mat_ecolor, @FallbackValue) AS mat_ecolor,
   oi.po_qty AS order_qty,
   COUNT(DISTINCT fd.EPC_Code) AS daily_outbound_qty,
   dp.accumulated_qty,
   CAST(oi.po_qty - dp.accumulated_qty AS INT) AS missing_qty,
   (
      SELECT 
         sd.mo_no,
         (
            SELECT 
               sd2.size_code AS size_numcode,
               sd2.qty
            FROM size_details sd2
            WHERE 
               sd2.po = sd.po AND 
               sd2.mo_no = sd.mo_no AND
               sd2.shoestyle_codefactory = sd.shoestyle_codefactory AND
               sd2.mat_ecolor = sd.mat_ecolor
            FOR JSON PATH
         ) AS sizes
      FROM size_details sd
      WHERE 
         sd.po = fd.po AND
         sd.shoestyle_codefactory = fd.shoestyle_codefactory AND
         sd.mat_ecolor = fd.mat_ecolor
      GROUP BY 
         sd.po, sd.mo_no, sd.shoestyle_codefactory, sd.mat_ecolor
      FOR JSON PATH
   ) AS detail,
   (
      SELECT 
         CASE 
            WHEN LEN(CAST(size_numcode AS NVARCHAR)) = 1 THEN CONCAT('0', size_numcode)
            ELSE CAST(size_numcode AS NVARCHAR) 
         END AS size_numcode,
      ps.qty AS po_size_qty,
      COALESCE(dp.accumulated_qty, 0) accumulated_qty,
      (ps.qty - COALESCE(dp.accumulated_qty, 0)) AS missing_qty
      FROM purchase_order_sizes ps
      LEFT JOIN daily_productivity dp ON dp.po = ps.po AND dp.size_code = ps.size_numcode
      WHERE ps.po = fd.po
      ORDER BY ps.size_numcode ASC
      FOR JSON PATH
   ) overall
FROM filtered_data fd
LEFT JOIN accumulated_qty dp ON dp.po = fd.po
LEFT JOIN order_info oi ON oi.po = fd.po
GROUP BY
   fd.po,
   fd.shoestyle_codefactory,
   fd.mat_ecolor,
   oi.po_qty,
   dp.accumulated_qty
ORDER BY fd.po ASC
-- * Avoid parameter sniffing and set max degree of parallelism;
OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 4);