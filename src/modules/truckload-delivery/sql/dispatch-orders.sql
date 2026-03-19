SELECT
   a.dispatch_order
   , a.created
   , a.factory_code
   , a.approval_status
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , a.factory_departure_time
   , MAX(b.snap_time) AS actual_departure_time
   , c.delivery_details
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
LEFT JOIN DV_DATA_LAKE.dbo.dv_carlicenseplates b
ON a.license_plate = b.plate_name 
   AND b.snap_time BETWEEN DATEADD(MINUTE, 5, ISNULL(a.container_sealing_time, GETDATE())) 
   AND DATEADD(MINUTE, 30, ISNULL(a.factory_departure_time, GETDATE())) 
CROSS APPLY (
    SELECT
        dd.po,
        dd.outbound_qty
    FROM DV_DATA_LAKE.dbo.dv_truckload_delivery dd
    WHERE dd.dispatch_order = a.dispatch_order AND dd.isactive = 'Y'
    FOR JSON PATH
) AS c (delivery_details)
WHERE a.isactive = 'Y'
   AND (
      (@2 IS NOT NULL AND @3 IS NOT NULL AND a.created BETWEEN @2 AND @3)
      OR (@2 IS NOT NULL AND @3 IS NULL AND a.created >= @2)
      OR (@2 IS NULL AND @3 IS NOT NULL AND a.created <= @3)
      OR (@2 IS NULL AND @3 IS NULL)
   )
   AND (
      @4 IS NULL 
      OR (@4 IS NOT NULL AND a.approval_status = @4)
   )
GROUP BY a.dispatch_order
   , a.factory_code
   , b.plate_name
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , a.factory_departure_time
   , a.approval_status
   , a.created
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , c.delivery_details
