DECLARE @record_time_floor AS DATE = CAST (DATEADD(YEAR, -2, GETDATE()) AS DATE);

-- Single-pass CTE chain (no #temp table): each CTE below is referenced exactly once downstream,
-- so the two large source tables are scanned only once instead of once per consumer (3x before).
WITH   inv_rfid_filtered
AS     (SELECT EPC_Code,
               po,
               mo_no,
               size_code,
               rfid_status,
               station_suffix,
               storage,
               quantity,
               record_time,
               FC_server_code,
               dept_name,
               isactive
        FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
        WHERE  mo_no = @0
               AND isactive = 'Y'
               AND rfid_status = 'A'
               AND station_suffix IN ('101', '102')
               AND record_time >= @record_time_floor
               AND EPC_Code NOT LIKE '303429%'
               AND EPC_Code NOT LIKE 'E28%'
               AND mo_no NOT IN ('13D05B006', '13A08C003')
        UNION ALL
        SELECT EPC_Code,
               po,
               mo_no,
               size_code,
               rfid_status,
               station_suffix,
               storage,
               quantity,
               record_time,
               FC_server_code,
               dept_name,
               isactive
        FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
        WHERE  mo_no = @0
               AND isactive = 'Y'
               AND rfid_status = 'A'
               AND station_suffix IN ('101', '102')
               AND record_time >= @record_time_floor
               AND EPC_Code NOT LIKE '303429%'
               AND EPC_Code NOT LIKE 'E28%'
               AND mo_no NOT IN ('13D05B006', '13A08C003')),
       latest_inv_rfid
AS     (SELECT EPC_Code,
               po,
               mo_no,
               size_code,
               storage,
               quantity,
               record_time,
               dept_name
        FROM   (SELECT EPC_Code,
                       po,
                       mo_no,
                       size_code,
                       storage,
                       quantity,
                       record_time,
                       dept_name,
                       ROW_NUMBER() OVER (PARTITION BY EPC_Code, station_suffix, rfid_status ORDER BY record_time DESC) AS rn
                FROM   inv_rfid_filtered) AS r
        WHERE  rn = 1),
       latest_with_wh
AS     (SELECT l.mo_no,
               l.size_code,
               l.dept_name,
               l.quantity,
               COALESCE (w.storage_name, '') AS storage_name,
               CONVERT (CHAR (16), l.record_time, 120) AS inbound_time
        FROM   latest_inv_rfid AS l
               LEFT OUTER JOIN
               DV_DATA_LAKE.dbo.dv_warehouseccodedet AS w
               ON w.storage_num COLLATE database_default = l.storage COLLATE database_default),
       agg
AS     (SELECT   GROUPING_ID(size_code, dept_name, storage_name, inbound_time) AS grp_id,
                 size_code AS size_numcode,
                 dept_name AS assembly_line,
                 storage_name AS storage_location,
                 inbound_time,
                 SUM(quantity) AS qty
        FROM     latest_with_wh
        GROUP BY GROUPING SETS((size_code, dept_name, storage_name, inbound_time), (size_code), ())),
       agg_json
AS     (SELECT grp_id,
               qty,
               (SELECT size_numcode,
                       qty,
                       assembly_line,
                       storage_location,
                       inbound_time
                FOR    JSON PATH, WITHOUT_ARRAY_WRAPPER) AS daily_row_json,
               (SELECT size_numcode,
                       qty
                FOR    JSON PATH, WITHOUT_ARRAY_WRAPPER) AS size_row_json
        FROM   agg),
       summary
AS     (SELECT COALESCE (MAX(CASE WHEN grp_id = 15 THEN qty END), 0) AS accumulated_inbound_qty,
               '[' + COALESCE (STRING_AGG(CASE WHEN grp_id = 0 THEN daily_row_json END, ','), '') + ']' AS daily_inbound_history,
               '[' + COALESCE (STRING_AGG(CASE WHEN grp_id = 7 THEN size_row_json END, ','), '') + ']' AS inbound_history_by_size
        FROM   agg_json),
       mo_size_run_cte
AS     (SELECT   CASE WHEN ISNUMERIC(b.size_numcode) = 1 THEN CAST (b.size_numcode AS FLOAT) WHEN LEFT(b.size_numcode, 1) IN ('T', 'K') THEN CAST (SUBSTRING(b.size_numcode, 2, LEN(b.size_numcode)) AS FLOAT) END AS [size_numcode],
                 SUM(CAST (b.size_qty AS INT)) AS qty
        FROM     wuerp_vnrd.dbo.ta_manufactursizerun AS a CROSS APPLY (VALUES ([size_numcode01], [size_qty01]), ([size_numcode02], [size_qty02]), ([size_numcode03], [size_qty03]), ([size_numcode04], [size_qty04]), ([size_numcode05], [size_qty05]), ([size_numcode06], [size_qty06]), ([size_numcode07], [size_qty07]), ([size_numcode08], [size_qty08]), ([size_numcode09], [size_qty09]), ([size_numcode10], [size_qty10]), ([size_numcode11], [size_qty11]), ([size_numcode12], [size_qty12]), ([size_numcode13], [size_qty13]), ([size_numcode14], [size_qty14]), ([size_numcode15], [size_qty15]), ([size_numcode16], [size_qty16]), ([size_numcode17], [size_qty17]), ([size_numcode18], [size_qty18]), ([size_numcode19], [size_qty19]), ([size_numcode20], [size_qty20]), ([size_numcode21], [size_qty21]), ([size_numcode22], [size_qty22]), ([size_numcode23], [size_qty23]), ([size_numcode24], [size_qty24]), ([size_numcode25], [size_qty25]), ([size_numcode26], [size_qty26]), ([size_numcode27], [size_qty27]), ([size_numcode28], [size_qty28]), ([size_numcode29], [size_qty29]), ([size_numcode30], [size_qty30]), ([size_numcode31], [size_qty31]), ([size_numcode32], [size_qty32]), ([size_numcode33], [size_qty33]), ([size_numcode34], [size_qty34]), ([size_numcode35], [size_qty35]), ([size_numcode36], [size_qty36]), ([size_numcode37], [size_qty37]), ([size_numcode38], [size_qty38]), ([size_numcode39], [size_qty39]), ([size_numcode40], [size_qty40])) AS b([size_numcode], [size_qty])
        WHERE    b.size_qty <> 0
                 AND a.isactive = 'Y'
                 AND a.mo_no = @0
        GROUP BY a.size_code, b.size_numcode)
SELECT DISTINCT b.cofactory_code AS factory_code_produce,
                b.mo_no,
                g.brand_name,
                f.shoestyle_codefactory AS factory_shoes_style,
                f.shoestyle_codecust AS cust_shoes_style,
                UPPER(CONCAT(e.color_sn, '/', e.mat_ecolor)) AS color,
                CAST (COALESCE (b.mo_totalqty, 0) AS INT) AS mo_qty,
                s.accumulated_inbound_qty,
                s.daily_inbound_history,
                s.inbound_history_by_size,
                (SELECT   CASE WHEN CAST (size_numcode AS FLOAT) < 10 THEN CONCAT('0', size_numcode) ELSE CAST (size_numcode AS NVARCHAR) END AS size_numcode,
                          qty
                 FROM     mo_size_run_cte
                 ORDER BY size_numcode ASC
                 FOR      JSON PATH) AS order_size_run
FROM   wuerp_vnrd.dbo.ta_manufacturmst AS b CROSS JOIN summary AS s
       LEFT OUTER JOIN
       wuerp_vnrd.dbo.ta_productmst AS e
       ON e.mat_code = b.mat_code
          AND e.isactive = 'Y'
       LEFT OUTER JOIN
       wuerp_vnrd.dbo.ta_shoefactorymst AS f
       ON f.shoestyle_systemcodefty = e.shoestyle_systemcodefty
          AND f.isactive = 'Y'
       LEFT OUTER JOIN
       wuerp_vnrd.dbo.ta_brand AS g
       ON g.custbrand_id = e.custbrand_id
WHERE  b.mo_no = @0
       AND b.isactive = 'Y'
OPTION (OPTIMIZE FOR UNKNOWN, KEEPFIXED PLAN);