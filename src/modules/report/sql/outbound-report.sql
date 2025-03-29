-- Tạo bảng tạm để lưu trữ dữ liệu từ hai bảng
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
    SELECT
        EPC_Code,
        po,
        mo_no,
        size_code,
        rfid_status,
        record_time,
        stationNO,
        FC_server_code,
        dept_name
    FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
    WHERE
        rfid_status = 'B'
        AND EPC_Code NOT LIKE '303429%'
        AND EPC_Code NOT LIKE 'E28%'
        AND mo_no <> '13D05B006'
        AND stationNO LIKE 'CUS%WH103'
        AND record_time >= @0
        AND record_time < DATEADD(day, 1, @0)
    UNION ALL
    SELECT
        EPC_Code,
        po,
        mo_no,
        size_code,
        rfid_status,
        record_time,
        stationNO,
        FC_server_code,
        dept_name
    FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
    WHERE
        rfid_status = 'B'
        AND EPC_Code NOT LIKE '303429%'
        AND EPC_Code NOT LIKE 'E28%'
        AND mo_no <> '13D05B006'
        AND stationNO LIKE 'CUS%WH103'
        AND record_time >= @0
        AND record_time < DATEADD(day, 1, @0)
) AS combined_data;

-- Tạo chỉ mục tạm thời trên bảng tạm để tăng hiệu suất truy vấn
CREATE INDEX idx_datalist_po ON #datalist(po);
CREATE INDEX idx_datalist_EPC_Code ON #datalist(EPC_Code);
CREATE INDEX idx_datalist_mo_no ON #datalist(mo_no);

-- Truy vấn chính sử dụng bảng tạm đã tạo
SELECT
    inv.po,
    pl.shoestyle_codefactory AS shoes_style_code_factory,
    pl.po_qty AS order_qty,
    COUNT(DISTINCT inv.EPC_Code) AS daily_outbound_qty,
    ac.accumulated_qty,
    CAST(pl.po_qty - ac.accumulated_qty AS INT) AS missing_qty,
    dt.detail
FROM #datalist inv
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc WITH (NOLOCK)
    ON inv.EPC_Code = rmc.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manf WITH (NOLOCK)
    ON manf.mo_no = inv.mo_no
LEFT JOIN (
    SELECT po, COUNT(DISTINCT EPC_Code) AS accumulated_qty
    FROM #datalist
    GROUP BY po
) ac
    ON ac.po = inv.po
LEFT JOIN (
    SELECT
        IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone) AS po,
        COALESCE(c.shoestyle_codefactory, 'Unknown') AS shoestyle_codefactory,
        (SUM(a.or_totalqty) - SUM(a.or_totalcqty)) AS po_qty
    FROM wuerp_vnrd.dbo.ta_ordermst a WITH (NOLOCK)
    LEFT JOIN wuerp_vnrd.dbo.ta_productmst b WITH (NOLOCK)
        ON a.mat_code = b.mat_code AND b.isactive = 'Y'
    LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c WITH (NOLOCK)
        ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
    WHERE a.isactive = 'Y'
    GROUP BY
        IIF(ISNULL(a.or_custpoone, '') = '', a.or_custpo, a.or_custpoone),
        c.shoestyle_codefactory
) pl
    ON inv.po = pl.po AND rmc.shoestyle_codefactory = pl.shoestyle_codefactory
OUTER APPLY ( 
   SELECT (
      SELECT
            d.mo_no,
            ISNULL(prod.mat_ecolor, 'Unknown') AS mat_ecolor,
            (
                SELECT
                    d.size_numcode,
                    COUNT(DISTINCT d.EPC_Code) AS qty
                FROM #datalist d
                WHERE
                    d.po = inv.po
                    AND d.mo_no = inv.mo_no
                    AND d.record_time >= @0
                    AND d.record_time < DATEADD(day, 1, @0)
                GROUP BY d.size_numcode
                FOR JSON PATH
            ) AS sizes
        FROM #datalist d
        LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust rmc WITH (NOLOCK)
            ON d.EPC_Code = rmc.EPC_Code
        LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod WITH (NOLOCK)
            ON rmc.mat_code = prod.mat_code
        WHERE
            d.po = inv.po
            AND d.mo_no = inv.mo_no
            AND d.record_time >= @0
            AND d.record_time < DATEADD(day, 1, @0)
        GROUP BY d.po, d.mo_no, ISNULL(prod.mat_ecolor, 'Unknown')
        FOR JSON PATH
   ) AS detail
) dt
GROUP BY
    inv.po,
    pl.shoestyle_codefactory,
    pl.po_qty,
    ac.accumulated_qty,
    dt.detail

	;

-- Xóa bảng tạm sau khi sử dụng
DROP TABLE #datalist;
