DROP TABLE IF EXISTS #datalist;

-- * Create temporary table to store data
SELECT
	EPC_Code,
	COALESCE(po, 'Unknown') AS po,
	COALESCE(mo_no, 'Unknown') AS mo_no,
	COALESCE(shoestyle_codefactory, 'Unknown') AS shoestyle_codefactory,
	COALESCE(mat_ecolor, 'Unknown') AS mat_ecolor,
	COALESCE(size_code, 'Unknown') AS size_numcode,
	rfid_status,
	record_time,
	stationNO,
	FC_server_code,
	dept_name
INTO #datalist
FROM (
	SELECT i.EPC_Code, i.po, i.mo_no, i.size_code, i.rfid_status, i.record_time, i.stationNO, i.FC_server_code, i.dept_name,
		r.shoestyle_codefactory, p.mat_ecolor
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet i
	LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust r
		ON i.EPC_Code = r.EPC_Code
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst p
		ON p.mat_code = r.mat_code AND p.isactive = 'Y'
	WHERE
		i.rfid_status = 'B'
		AND i.EPC_Code NOT LIKE '303429%'
		AND i.EPC_Code NOT LIKE 'E28%'
		AND i.mo_no <> '13D05B006'
		AND i.stationNO LIKE 'CUS%WH103'
	UNION ALL
	SELECT i.EPC_Code, i.po, i.mo_no, i.size_code, i.rfid_status, i.record_time, i.stationNO, i.FC_server_code, i.dept_name,
		r.shoestyle_codefactory, p.mat_ecolor
	FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet i
	LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust r
		ON i.EPC_Code = r.EPC_Code
	LEFT JOIN wuerp_vnrd.dbo.ta_productmst p
		ON p.mat_code = r.mat_code AND p.isactive = 'Y'
	WHERE
		i.rfid_status = 'B'
		AND i.EPC_Code NOT LIKE '303429%'
		AND i.EPC_Code NOT LIKE 'E28%'
		AND i.mo_no <> '13D05B006'
		AND i.stationNO LIKE 'CUS%WH103' -- Only select data from the last 2 years
) AS combined_data;

-- * Create index for temporary table to improve query performance
CREATE INDEX idx_datalist_EPC_Code ON #datalist(EPC_Code);
CREATE INDEX idx_datalist_po ON #datalist(po);
CREATE INDEX idx_datalist_mo_no ON #datalist(mo_no);
CREATE INDEX idx_datalist_shoestyle_codefactory ON #datalist(shoestyle_codefactory);
CREATE INDEX idx_datalist_mat_ecolor ON #datalist(mat_ecolor);

-- * Main stage: Select data
SELECT
	inv.po,
	inv.shoestyle_codefactory AS shoes_style_code_factory,
	inv.mat_ecolor,
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
OUTER APPLY (
	SELECT
	IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po,
	CAST(SUM(a.or_totalqty) - SUM(a.or_totalcqty) AS INT) AS po_qty
FROM wuerp_vnrd.dbo.ta_ordermst a
WHERE a.isactive = 'Y' 
	AND IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) = inv.po
GROUP BY
	IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone)
) pl
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
        AND d1.mat_ecolor = inv.mat_ecolor
        AND d1.shoestyle_codefactory = inv.shoestyle_codefactory
        AND CAST(d1.record_time AS DATE) = @0
    GROUP BY d1.po, d1.mo_no, d1.shoestyle_codefactory, d1.mat_ecolor 
    FOR JSON PATH
    ) detail
) pd
WHERE CAST(inv.record_time AS DATE) = @0
GROUP BY
	inv.po,
	inv.shoestyle_codefactory,
	inv.mat_ecolor,
	pl.po_qty,
	ac.accumulated_qty,
	pd.detail
ORDER BY inv.po ASC;

-- * Delete temporary table on completion
DROP TABLE #datalist;