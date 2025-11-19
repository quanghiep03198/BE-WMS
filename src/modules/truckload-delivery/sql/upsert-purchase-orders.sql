MERGE INTO DV_DATA_LAKE.dbo.dv_truckload_delivery AS target
USING (
   SELECT 
      JSON_VALUE(value, '$.dispatch_order') AS dispatch_order,
      JSON_VALUE(value, '$.id') AS keyid,
      JSON_VALUE(value, '$.po') AS po,
      JSON_VALUE(value, '$.factory_code') AS factory_code,
      CAST(JSON_VALUE(value, '$.outbound_qty') AS INT) AS outbound_qty
   FROM OPENJSON(@0)
) AS source
ON target.keyid = source.keyid
WHEN MATCHED THEN
   UPDATE SET 
      target.po = source.po,
      target.outbound_qty = source.outbound_qty
WHEN NOT MATCHED BY TARGET THEN
   INSERT (dispatch_order, po, outbound_qty, factory_code)
   VALUES (source.dispatch_order, source.po, source.outbound_qty, source.factory_code);