DECLARE @FallbackValue NVARCHAR(10) = 'Unknown';

WITH inv_rfid AS(
   SELECT EPC_Code, po, mo_no, size_code, rfid_status, stationNO, record_time, FC_server_code, isactive
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND FC_server_code = @0
      AND po = @1
      AND RIGHT(stationNO, 5) = 'WH103'
   UNION ALL
   SELECT EPC_Code, po, mo_no, size_code, rfid_status, stationNO, record_time, FC_server_code, isactive
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
   WHERE 
      isactive = 'Y'
      AND FC_server_code = @0
      AND po = @1
      AND RIGHT(stationNO, 5) = 'WH103'
),
base_data AS (
   SELECT 
      DISTINCT i.EPC_Code, 
      CAST(i.record_time AS DATE) AS outbound_date,
      i.po, 
      i.mo_no, 
      CASE 
         WHEN LEFT(CAST(i.size_code AS NVARCHAR(10)), 1) = '0' THEN i.size_code
         WHEN ISNUMERIC(i.size_code) = 1 
            AND i.size_code NOT IN ('', '.', '-', '+')  -- Exclude edge cases
            AND CAST(i.size_code AS FLOAT) < 10 
            THEN CAST(CONCAT('0', i.size_code) AS NVARCHAR(10))
         ELSE CAST(i.size_code AS NVARCHAR(10)) 
      END AS size_code, 
      i.record_time,
      i.FC_server_code
   FROM inv_rfid i
   WHERE
      i.isactive = 'Y'
      AND i.rfid_status = 'B'
      AND RIGHT(i.stationNO, 5) = 'WH103'
      AND i.FC_server_code = @0
      AND i.po = @1
      AND i.mo_no NOT IN ('13D05B006', '13A08C003')
      AND i.EPC_Code NOT LIKE '303429%'
      AND i.EPC_Code NOT LIKE 'E28%'
      AND i.record_time >= CAST(DATEADD(YEAR, -1, GETDATE()) AS DATE)
),

-- * Size quantity by purchase order 
po_size_qty AS (
   SELECT 
      IIF(ISNULL(or1.or_custpoone, @1) = @1, or1.or_custpo, or1.or_custpoone) AS po,
      CASE 
         WHEN ISNUMERIC(b.size_numcode) = 1 THEN CAST(b.size_numcode AS NVARCHAR) 
         WHEN LEFT(b.size_numcode, 1) IN ('T', 'K') THEN SUBSTRING(b.size_numcode, 2, LEN(b.size_numcode))
      END AS [size_numcode], 
   SUM(CAST(b.size_qty AS INT)) AS qty
   FROM wuerp_vnrd.dbo.ta_ordersizerun a
   LEFT JOIN wuerp_vnrd.dbo.ta_ordermst or1
      ON or1.or_no = a.or_no
      AND a.isactive = 'Y'
      AND or1.isactive = 'Y'
   CROSS APPLY (
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
   ) b ([size_numcode],[size_qty])
   WHERE b.size_qty <> 0
      AND a.isactive = 'Y'
      AND or1.isactive = 'Y'
   GROUP BY 
      IIF(ISNULL(or1.or_custpoone, @1) = @1, or1.or_custpo, or1.or_custpoone), 
      CASE 
         WHEN ISNUMERIC(b.size_numcode) = 1 THEN CAST(b.size_numcode AS NVARCHAR) 
         WHEN LEFT(b.size_numcode, 1) IN ('T', 'K') THEN SUBSTRING(b.size_numcode, 2, LEN(b.size_numcode))
      END
),

-- * Accumulated quantity calculation
po_acc_outbound_qty AS (
   SELECT po, COUNT(DISTINCT EPC_Code) AS po_acc_outbound_qty
   FROM base_data
   GROUP BY po
),

-- * Purchase order information
po_info AS (
   SELECT
      IIF(ISNULL(ord.or_custpoone, @1) = @1, ord.or_custpo, ord.or_custpoone) AS po,
      CAST(SUM(ord.or_totalqty) - SUM(ord.or_totalcqty) AS INT) AS po_qty,
      br.brand_name,
      sfm.shoestyle_codefactory AS factory_shoes_style,
      sfm.shoestyle_codecust AS cust_shoes_style,
      UPPER(CONCAT(prod.color_sn, '/', prod.mat_ecolor)) AS color_sn
   FROM wuerp_vnrd.dbo.ta_ordermst ord
   LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod
      ON prod.mat_code = ord.mat_code
      AND prod.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_brand br
      ON br.custbrand_id = ord.custbrand_id
      AND br.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst sfm
      ON sfm.shoestyle_systemcodefty = prod.shoestyle_systemcodefty
      AND sfm.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet mand
      ON ord.or_no = mand.or_no
      AND mand.isactive = 'Y'
   LEFT JOIN DV_DATA_LAKE.dbo.dv_OrderProcessR05 ordp
      ON ordp.PO = IIF(ISNULL(ord.or_custpoone,  @1) =  @1, ord.or_custpo, ord.or_custpoone)
   WHERE ord.isactive = 'Y'
   GROUP BY
      IIF(ISNULL(ord.or_custpoone, @1) = @1, ord.or_custpo, ord.or_custpoone),
      br.brand_name,
      sfm.shoestyle_codefactory,
      sfm.shoestyle_codecust,
      prod.color_sn,
      prod.mat_ecolor
),

-- * Daily productivity by size groupped by Manufacturing Order (MO)
daily_mo_productivity AS (
   SELECT
      bd.outbound_date,
      bd.po,
      bd.mo_no,
      bd.size_code,
      COUNT(DISTINCT bd.EPC_Code) AS qty
   FROM base_data bd
   GROUP BY 
      bd.po, bd.outbound_date, bd.mo_no, bd.size_code
),

-- * Aggregate size data for each purchase order
agg_size_data AS (
   SELECT 
      ps.po,
      CASE 
         WHEN CAST(ps.size_numcode AS FLOAT) < 10 THEN CAST(CONCAT('0', ps.size_numcode) AS NVARCHAR(10))
         ELSE CAST(ps.size_numcode AS NVARCHAR(10)) 
      END AS size_numcode,
      ps.qty AS po_size_qty,
      (
         SELECT COUNT(DISTINCT EPC_Code) FROM base_data bd 
         WHERE bd.po = ps.po AND bd.size_code = CASE 
            WHEN ISNUMERIC(ps.size_numcode) = 1 AND CAST(ps.size_numcode AS FLOAT) < 10 THEN CAST(CONCAT('0', ps.size_numcode) AS NVARCHAR(10))
            ELSE CAST(ps.size_numcode AS NVARCHAR(10)) 
         END
      ) AS acc_qty
   FROM po_size_qty ps
)
-- * Main query * --
SELECT
   pi.po,
   pi.brand_name AS brand_name, 
   COALESCE(pi.factory_shoes_style, @FallbackValue) AS factory_shoes_style,
   COALESCE(pi.cust_shoes_style, @FallbackValue) AS cust_shoes_style,
   COALESCE(pi.color_sn, @FallbackValue) AS color_sn,
   pi.po_qty AS po_qty,
   ISNULL(paoq.po_acc_outbound_qty, 0) AS accumulated_outbound_qty,
   CAST(ISNULL(pi.po_qty - paoq.po_acc_outbound_qty, 0) AS INT) AS missing_qty,
   (
      SELECT 
         dmp.outbound_date,
         dmp.mo_no,
         (
            SELECT dmp2.size_code AS size_numcode, dmp2.qty
            FROM daily_mo_productivity dmp2
            WHERE 
               dmp2.po = dmp.po  
               AND dmp2.mo_no = dmp.mo_no 
               AND dmp2.outbound_date = dmp.outbound_date
            FOR JSON PATH
         ) AS sizes
      FROM daily_mo_productivity dmp
      WHERE dmp.po = pi.po
      GROUP BY 
         dmp.po, dmp.outbound_date, dmp.mo_no
      FOR JSON PATH
   ) AS outbound_history,
   (
      SELECT 
         size_numcode,
         po_size_qty,
         acc_qty,
         (po_size_qty - COALESCE(acc_qty, 0)) AS missing_qty
      FROM agg_size_data
      WHERE po = pi.po
      ORDER BY size_numcode ASC
      FOR JSON PATH
   ) AS overall
FROM po_info pi
LEFT JOIN po_acc_outbound_qty paoq ON paoq.po = pi.po
WHERE pi.po = @1
GROUP BY pi.brand_name, pi.po, pi.factory_shoes_style, pi.cust_shoes_style, pi.color_sn, pi.po_qty, paoq.po_acc_outbound_qty
ORDER BY pi.po
OPTION (
	OPTIMIZE FOR UNKNOWN,                           -- * Avoid "Paramenter Sniffing" issues
	USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'),    -- * Prioritize parallel plan
   RECOMPILE
);


