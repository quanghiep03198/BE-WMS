export default /* SQL */ `
WITH po_size_qty AS (
   SELECT 
      CASE 
         WHEN ISNUMERIC(sr.size_numcode) = 1 THEN CAST(sr.size_numcode AS FLOAT) 
         WHEN LEFT(sr.size_numcode, 1) IN ('T', 'K') THEN CAST(SUBSTRING(sr.size_numcode, 2, LEN(sr.size_numcode)) AS FLOAT)
      END AS [size_numcode], 
   SUM(CAST(sr.size_qty AS INT)) AS qty
   FROM wuerp_vnrd.dbo.ta_ordersizerun osr
   LEFT JOIN wuerp_vnrd.dbo.ta_ordermst ord
      ON ord.or_no = osr.or_no
      AND osr.isactive = 'Y'
      AND ord.isactive = 'Y'
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
   ) sr ([size_numcode],[size_qty])
   WHERE sr.size_qty <> 0
      AND osr.isactive = 'Y'
      AND ord.isactive = 'Y'
      AND IIF(ISNULL(ord.or_custpoone, '') = '', ord.or_custpo, ord.or_custpoone) = @0
   GROUP BY 
      IIF(ISNULL(ord.or_custpoone, '') = '', ord.or_custpo, ord.or_custpoone), 
      CASE 
         WHEN ISNUMERIC(sr.size_numcode) = 1 THEN CAST(sr.size_numcode AS FLOAT) 
         WHEN LEFT(sr.size_numcode, 1) IN ('T', 'K') THEN CAST(SUBSTRING(sr.size_numcode, 2, LEN(sr.size_numcode)) AS FLOAT)
      END
),
outbound_epcs AS (
   SELECT DISTINCT EPC_Code, CAST(size_code AS FLOAT) AS size_numcode 
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
   WHERE po = @0 AND RIGHT(stationNO, 3) = '103' AND rfid_status = 'B' AND isactive = 'Y'
   UNION ALL
   SELECT DISTINCT EPC_Code, CAST(size_code AS FLOAT) AS size_numcode 
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
   WHERE po = @0 AND RIGHT(stationNO, 3) = '103' AND rfid_status = 'B' AND isactive = 'Y'
   UNION ALL
   SELECT JSON_VALUE(value, '$.epc') AS EPC_Code, CAST(JSON_VALUE(value, '$.size_numcode') AS FLOAT) AS size_numcode 
   FROM OPENJSON(@1)
),
outbound_qty AS (
   SELECT size_numcode, COUNT(DISTINCT EPC_Code) AS outbound_qty
   FROM outbound_epcs
   GROUP BY size_numcode
)
SELECT 
   CAST(psq.size_numcode AS NVARCHAR) AS size_numcode, 
   psq.qty AS po_qty,
   ISNULL(oq.outbound_qty, 0) AS outbound_qty,
   psq.qty - ISNULL(oq.outbound_qty, 0) AS missing_qty
FROM po_size_qty psq
LEFT JOIN outbound_qty oq ON psq.size_numcode = oq.size_numcode
`
