DROP TABLE IF EXISTS #datalist;

-- * Create temporary table to store data
SELECT
	EPC_Code,
	COALESCE(po, 'Unknown') AS po,
	COALESCE(mo_no, 'Unknown') AS mo_no,
	COALESCE(size_code, 'Unknown') AS size_numcode,
	rfid_status,
	record_time,
	stationNO,
	FC_server_code,
	dept_name
INTO #datalist
FROM (
	SELECT EPC_Code, po, mo_no, size_code, rfid_status, record_time, stationNO, FC_server_code, dept_name
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
	WHERE
		rfid_status = 'B'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH103'
	UNION ALL
	SELECT EPC_Code, po, mo_no, size_code, rfid_status, record_time, stationNO, FC_server_code, dept_name
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
	WHERE
		rfid_status = 'B'
		AND EPC_Code NOT LIKE '303429%'
		AND EPC_Code NOT LIKE 'E28%'
		AND mo_no <> '13D05B006'
		AND stationNO LIKE 'CUS%WH103'
		AND record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE) -- Only select data from the last 2 years
) AS combined_data;

-- * Create index for temporary table to improve query performance
CREATE INDEX idx_datalist_po ON #datalist(po);
CREATE INDEX idx_datalist_EPC_Code ON #datalist(EPC_Code);
CREATE INDEX idx_datalist_mo_no ON #datalist(mo_no);

-- * Main stage: Select data
SELECT
	inv.po,
	pl.shoestyle_codefactory AS shoes_style_code_factory,
	pl.mat_ecolor,
	pl.po_qty AS order_qty,
	COUNT(DISTINCT inv.EPC_Code) AS daily_outbound_qty,
	ac.accumulated_qty,
	CAST(pl.po_qty - ac.accumulated_qty AS INT) AS missing_qty,
	pd.detail
FROM #datalist inv
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc
	ON inv.EPC_Code = rmc.EPC_Code
LEFT JOIN (
	SELECT po, COUNT(DISTINCT EPC_Code) AS accumulated_qty
	FROM #datalist
	GROUP BY po
) ac ON ac.po = inv.po
-- Outstock report master data
LEFT JOIN (
	SELECT
	IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po,
	COALESCE(c.shoestyle_codefactory, 'Unknown') AS shoestyle_codefactory,
	COALESCE(b.mat_ecolor, 'Unknown') AS mat_ecolor,
	(SUM(a.or_totalqty) - SUM(a.or_totalcqty)) AS po_qty
FROM wuerp_vnrd.dbo.ta_ordermst a
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst b
	ON a.mat_code = b.mat_code AND b.isactive = 'Y'
	LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c
	ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
WHERE a.isactive = 'Y'
GROUP BY
		IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone),
		c.shoestyle_codefactory,
		b.mat_ecolor
) pl
	ON inv.po = pl.po 
	AND rmc.shoestyle_codefactory = pl.shoestyle_codefactory
-- Outstock report detail
CROSS APPLY ( 
	-- Stage 0: Select PO detail as JSON
	SELECT (
		-- Stage 1: Select command number detail
		SELECT d1.mo_no, (
			-- Stage 2: Select size quantity detail as array JSON
			SELECT
			d2.size_numcode,
			COUNT(DISTINCT d2.EPC_Code) AS qty
		FROM #datalist d2
		WHERE
			d2.po = d1.po
			AND d2.mo_no = d1.mo_no
			AND CAST(d2.record_time AS DATE) = @0
		GROUP BY d2.size_numcode
		FOR JSON PATH
		) AS sizes
	FROM #datalist d1
	WHERE 
		d1.po = inv.po 
		AND CAST(d1.record_time AS DATE) = @0
	GROUP BY d1.po, d1.mo_no
	FOR JSON PATH
	) detail
) pd
WHERE CAST(inv.record_time AS DATE) = @0
GROUP BY
	inv.po,
	pl.shoestyle_codefactory,
	pl.mat_ecolor,
	pl.po_qty,
	ac.accumulated_qty,
	pd.detail
ORDER BY inv.po ASC;

-- * Delete temporary table on completion
DROP TABLE #datalist;