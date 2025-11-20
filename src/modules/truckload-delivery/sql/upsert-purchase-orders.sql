MERGE INTO DV_DATA_LAKE.dbo.dv_truckload_delivery AS target
USING (
   SELECT 
      JSON_VALUE(value, '$.dispatch_order') AS dispatch_order,
      JSON_VALUE(value, '$.license_plate') AS license_plate,
      JSON_VALUE(value, '$.container_number') AS container_number,
      JSON_VALUE(value, '$.id') AS keyid,
      JSON_VALUE(value, '$.po') AS po,
      JSON_VALUE(value, '$.factory_code') AS factory_code,
      JSON_VALUE(value, '$.status') AS status,
      JSON_VALUE(value, '$.user_code_created') AS user_code_created,
      JSON_VALUE(value, '$.user_code_updated') AS user_code_updated,
      CAST(JSON_VALUE(value, '$.outbound_qty') AS INT) AS outbound_qty
   FROM OPENJSON(@0)
) AS source
ON target.keyid = source.keyid
WHEN MATCHED THEN
   UPDATE SET 
      target.po = source.po,
      target.outbound_qty = source.outbound_qty,
      target.user_name_updated = source.user_code_updated,
      target.user_code_updated = source.user_code_updated
WHEN NOT MATCHED BY TARGET THEN
   INSERT (
      dispatch_order, 
      license_plate, 
      container_number, 
      po, 
      outbound_qty, 
      factory_code, 
      status, 
      user_code_created, 
      user_name_created
   )
   VALUES (
      source.dispatch_order, 
      source.license_plate, 
      source.container_number, 
      source.po, 
      source.outbound_qty, 
      source.factory_code, 
      source.status, 
      source.user_code_created, 
      source.user_code_created
   );