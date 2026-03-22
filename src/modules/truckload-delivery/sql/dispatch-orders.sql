SELECT
   a.dispatch_order
   , MIN(a.created) AS created_at
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
   , SUM(a.outbound_qty) AS total_outbound_qty
   , c.delivery_details
   , MAX(a.ie_signature) AS ie_signature
   , MAX(a.warehouse_officer_signature) AS warehouse_officer_signature
   , MAX(a.security_1_signature) AS security_1_signature
   , MAX(a.security_2_signature) AS security_2_signature
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
GROUP BY a.dispatch_order
   , a.factory_code
   , b.plate_name
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , a.factory_departure_time
   , a.approval_status
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , c.delivery_details
