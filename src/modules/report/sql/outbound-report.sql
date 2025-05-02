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
   aq.accumulated_qty,
   CAST(oi.po_qty - aq.accumulated_qty AS INT) AS missing_qty,
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
   ) AS detail
FROM filtered_data fd
LEFT JOIN accumulated_qty aq ON aq.po = fd.po
LEFT JOIN order_info oi ON oi.po = fd.po
GROUP BY
   fd.po,
   fd.shoestyle_codefactory,
   fd.mat_ecolor,
   oi.po_qty,
   aq.accumulated_qty
ORDER BY fd.po ASC
-- * Avoid parameter sniffing and set max degree of parallelism;
OPTION (OPTIMIZE FOR UNKNOWN);