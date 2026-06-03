WITH inv_rfid AS(
   SELECT EPC_Code, po, mo_no, size_code, rfid_status, stationNO, record_time, FC_server_code, isactive
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
   WHERE 
      mo_no = @0
      AND isactive = 'Y' 
      AND (RIGHT(stationNO, 5) = 'WH101' OR RIGHT(stationNO, 5) = 'WH102')
   UNION ALL
   SELECT EPC_Code, po, mo_no, size_code, rfid_status, stationNO, record_time, FC_server_code, isactive
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
   WHERE 
      mo_no = @0
      AND isactive = 'Y' 
      AND (RIGHT(stationNO, 5) = 'WH101' OR RIGHT(stationNO, 5) = 'WH102')
),
daily_inbound_history_cte AS (
   SELECT 
      a.size_code AS size_numcode,
      COUNT(DISTINCT a.EPC_Code) AS qty,
      CAST(a.record_time AS DATE) AS inbound_date
   FROM inv_rfid a
   WHERE 
		a.isactive = 'Y'
		AND a.rfid_status = 'A'
		AND a.record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
		AND a.EPC_Code NOT LIKE '303429%'
		AND a.EPC_Code NOT LIKE 'E28%'
		AND a.mo_no NOT IN ('13D05B006', '13A08C003')
      AND a.mo_no = @0
		AND (RIGHT(a.stationNO, 5) = 'WH101' OR RIGHT(a.stationNO, 5) = 'WH102')
   GROUP BY 
      a.mo_no, 
      a.size_code,
      CAST(a.record_time AS DATE)
),
inbound_history_by_size_cte AS (
   SELECT 
      a.size_code AS size_numcode,
      COUNT(DISTINCT a.EPC_Code) AS qty
   FROM inv_rfid a WITH (NOLOCK)
   WHERE 
		a.isactive = 'Y'
		AND a.rfid_status = 'A'
		AND a.record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
		AND a.EPC_Code NOT LIKE '303429%'
		AND a.EPC_Code NOT LIKE 'E28%'
		AND a.mo_no NOT IN ('13D05B006', '13A08C003')
      AND a.mo_no = @0
		AND (RIGHT(a.stationNO, 5) = 'WH101' OR RIGHT(a.stationNO, 5) = 'WH102')
   GROUP BY 
      a.mo_no, 
      a.size_code
),
mo_size_run_cte AS (
	SELECT
		CASE 
			WHEN ISNUMERIC(b.size_numcode) = 1 THEN CAST(b.size_numcode AS FLOAT) 
			WHEN LEFT(b.size_numcode, 1) IN ('T', 'K') THEN CAST(SUBSTRING(b.size_numcode, 2, LEN(b.size_numcode)) AS FLOAT)
		END AS [size_numcode], 
		SUM(CAST(b.size_qty AS INT)) AS qty
	FROM wuerp_vnrd.dbo.ta_ordersizerun a
	LEFT JOIN wuerp_vnrd.dbo.ta_ordermst or1 ON or1.or_no = a.or_no
		AND or1.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet a1 ON or1.or_no = a1.or_no
		AND a1.isactive = 'Y'
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
	) b ([size_numcode],[size_qty])
	WHERE b.size_qty <> 0
	AND a.isactive = 'Y'
	AND a1.mo_no = @0
	GROUP BY a.size_code, b.size_numcode
)
SELECT 
   b.cofactory_code AS factory_code_produce,
   b.mo_no,
   g.brand_name,
	f.shoestyle_codefactory AS factory_shoes_style,
   f.shoestyle_codecust AS cust_shoes_style,
   UPPER(CONCAT(e.color_sn, '/', (e.mat_ecolor))) AS color,
   CAST(COALESCE(b.mo_totalqty, 0) AS INT) AS mo_qty,
   COUNT(DISTINCT a.EPC_Code) AS accumulated_inbound_qty,
   (SELECT * FROM daily_inbound_history_cte FOR JSON PATH) AS daily_inbound_history,
   (SELECT * FROM inbound_history_by_size_cte FOR JSON PATH) AS inbound_history_by_size,
   (
      SELECT 
      CASE 
         WHEN CAST(size_numcode AS FLOAT) < 10 THEN CONCAT('0', size_numcode)
         ELSE CAST(size_numcode AS NVARCHAR) 
      END AS size_numcode,
      qty
      FROM mo_size_run_cte
      ORDER BY size_numcode ASC FOR JSON PATH
   ) AS order_size_run
FROM wuerp_vnrd.dbo.ta_manufacturmst b 
LEFT JOIN inv_rfid a ON a.mo_no = b.mo_no AND b.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet c ON c.mo_no = b.mo_no AND c.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_ordermst d ON c.or_no = c.or_no AND d.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst e ON e.mat_code = b.mat_code AND e.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst f ON f.shoestyle_systemcodefty = e.shoestyle_systemcodefty AND f.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_brand g ON g.custbrand_id = e.custbrand_id
WHERE b.mo_no = @0
GROUP BY 
   b.cofactory_code,
   b.mo_no, CAST(COALESCE(b.mo_totalqty, 0) AS INT),
   g.brand_name,
   f.shoestyle_codefactory,
   f.shoestyle_codecust,
   UPPER(CONCAT(e.color_sn, '/', (e.mat_ecolor)))
OPTION (
   OPTIMIZE FOR (@0 UNKNOWN)
)