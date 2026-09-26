export default /* SQL */ `
WITH     CTE
AS       (SELECT a.po,
                 po_type,
                 c.mo_no,
                 a.po_totalqty AS order_qty,
                 UPPER(a.ship_type) AS shipping_method,
                 a.destCountry AS shipping_destination,
                 a.brand AS brand_name,
                 a.shoestyle_codefactory AS factory_shoes_style,
                 CONCAT(a.shoestyle_codecust, '/', a.shoestyle_namecust) AS cust_shoes_style,
                 a.color_sn,
                 a.XF_Date,
                 sr.size_numcode,
                 sr.size_qty,
                 ROW_NUMBER() OVER (PARTITION BY a.po ORDER BY a.keyid DESC) AS row_num
          FROM   DV_DATA_LAKE.dbo.dv_OrderProcessR05 AS a
                 INNER JOIN
                 wuerp_vnrd.dbo.ta_ordermst AS b
                 ON a.po = IIF (ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone)
                 INNER JOIN
                 wuerp_vnrd.dbo.ta_manufacturdet AS c
                 ON c.or_no = b.or_no
                 INNER JOIN
                 wuerp_vnrd.dbo.ta_ordersizerun AS d
                 ON d.or_no = b.or_no CROSS APPLY (VALUES ([size_numcode01], [size_qty01] - [size_qtycancel01]), ([size_numcode02], [size_qty02] - [size_qtycancel02]), ([size_numcode03], [size_qty03] - [size_qtycancel03]), ([size_numcode04], [size_qty04] - [size_qtycancel04]), ([size_numcode05], [size_qty05] - [size_qtycancel05]), ([size_numcode06], [size_qty06] - [size_qtycancel06]), ([size_numcode07], [size_qty07] - [size_qtycancel07]), ([size_numcode08], [size_qty08] - [size_qtycancel08]), ([size_numcode09], [size_qty09] - [size_qtycancel09]), ([size_numcode10], [size_qty10] - [size_qtycancel10]), ([size_numcode11], [size_qty11] - [size_qtycancel11]), ([size_numcode12], [size_qty12] - [size_qtycancel12]), ([size_numcode13], [size_qty13] - [size_qtycancel13]), ([size_numcode14], [size_qty14] - [size_qtycancel14]), ([size_numcode15], [size_qty15] - [size_qtycancel15]), ([size_numcode16], [size_qty16] - [size_qtycancel16]), ([size_numcode17], [size_qty17] - [size_qtycancel17]), ([size_numcode18], [size_qty18] - [size_qtycancel18]), ([size_numcode19], [size_qty19] - [size_qtycancel19]), ([size_numcode20], [size_qty20] - [size_qtycancel20]), ([size_numcode21], [size_qty21] - [size_qtycancel21]), ([size_numcode22], [size_qty22] - [size_qtycancel22]), ([size_numcode23], [size_qty23] - [size_qtycancel23]), ([size_numcode24], [size_qty24] - [size_qtycancel24]), ([size_numcode25], [size_qty25] - [size_qtycancel25]), ([size_numcode26], [size_qty26] - [size_qtycancel26]), ([size_numcode27], [size_qty27] - [size_qtycancel27]), ([size_numcode28], [size_qty28] - [size_qtycancel28]), ([size_numcode29], [size_qty29] - [size_qtycancel29]), ([size_numcode30], [size_qty30] - [size_qtycancel30]), ([size_numcode31], [size_qty31] - [size_qtycancel31]), ([size_numcode32], [size_qty32] - [size_qtycancel32]), ([size_numcode33], [size_qty33] - [size_qtycancel33]), ([size_numcode34], [size_qty34] - [size_qtycancel34]), ([size_numcode35], [size_qty35] - [size_qtycancel35]), ([size_numcode36], [size_qty36] - [size_qtycancel36]), ([size_numcode37], [size_qty37] - [size_qtycancel37]), ([size_numcode38], [size_qty38] - [size_qtycancel38]), ([size_numcode39], [size_qty39] - [size_qtycancel39]), ([size_numcode40], [size_qty40] - [size_qtycancel40])) AS sr([size_numcode], [size_qty])
          WHERE  sr.size_qty > 0
                 AND a.po = @0
                 AND a.active = 'Y'),
         CTE_PACKING
AS       (SELECT   po,
                   po_type,
                   mo_no,
                   order_qty,
                   shipping_method,
                   shipping_destination,
                   brand_name,
                   factory_shoes_style,
                   cust_shoes_style,
                   color_sn,
                   CONCAT('"', mo_no, '":{', STRING_AGG(CAST (CONCAT('"', size_numcode, '":', size_qty) AS NVARCHAR (MAX)), ','), '}') AS mo_packing
          FROM     CTE
          GROUP BY po, po_type, mo_no, order_qty, shipping_method, shipping_destination, brand_name, factory_shoes_style, cust_shoes_style, color_sn),
         CTE_SIZE_LEDGER
AS       (SELECT   po,
                   size_numcode,
                   SUM(size_qty) AS total_qty
          FROM     CTE
          GROUP BY po, size_numcode),
         CTE_PROGRESS
AS       (SELECT   po,
                   CONCAT('{', STRING_AGG(CAST (CONCAT('"', size_numcode, '":{"order_qty":', total_qty, '}') AS NVARCHAR (MAX)), ','), '}') AS shipping_progress
          FROM     CTE_SIZE_LEDGER
          GROUP BY po)
SELECT   m.po,
         m.order_qty,
         m.shipping_method,
         m.shipping_destination,
         m.brand_name,
         m.factory_shoes_style,
         m.cust_shoes_style,
         m.color_sn,
         CONCAT('{', STRING_AGG(m.mo_packing, ','), '}') AS packing,
         MAX(p.shipping_progress) AS shipping_progress
FROM     CTE_PACKING AS m
         INNER JOIN
         CTE_PROGRESS AS p
         ON p.po = m.po
GROUP BY m.po, m.order_qty, m.shipping_method, m.shipping_destination, m.brand_name, m.factory_shoes_style, m.cust_shoes_style, m.color_sn
ORDER BY m.po
OPTION (
   KEEPFIXED PLAN
);
`
