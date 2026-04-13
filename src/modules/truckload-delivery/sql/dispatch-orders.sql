SELECT
   a.dispatch_order
   , MIN(a.created) AS created_at
   , ISNULL(MAX(b.images), MAX(f.images)) AS license_plate_image
   , a.factory_code
   , a.approval_status
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , a.factory_departure_time
   , MAX(f.snap_time) AS actual_snap_time
   , MAX(b.snap_time) AS actual_departure_time
   , c.total_outbound_qty
   , MAX(a.ie_signature) AS ie_signature
   , MAX(a.warehouse_officer_signature) AS warehouse_officer_signature
   , MAX(a.security_1_signature) AS security_1_signature
   , MAX(a.security_2_signature) AS security_2_signature
   , d.delivery_details
   -- * possible_signing_late = 1 chỉ khi:
   -- * 1. Có snapshot trong 15 phút TRƯỚC container_sealing_time (f.possible_signing_late = 1)
   -- * 2. VÀ xe thực sự đã xuất hiện SAU khi đóng container (MAX(b.snap_time) IS NOT NULL)
   , CAST(
      MAX(CASE WHEN f.possible_signing_late = 1 AND b.snap_time IS NULL THEN 1 ELSE 0 END)
   AS BIT) AS possible_signing_late
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
LEFT JOIN DV_DATA_LAKE.dbo.dv_carlicenseplates b
   ON TRIM(UPPER(a.license_plate)) = TRIM(UPPER(b.plate_name)) 
   AND b.snap_time 
      BETWEEN DATEADD(MINUTE, 1, a.container_sealing_time) 
      AND DATEADD(MINUTE, 30, a.factory_departure_time)
CROSS APPLY (
   SELECT SUM(td.outbound_qty) AS total_outbound_qty
   FROM DV_DATA_LAKE.dbo.dv_truckload_delivery td
   WHERE td.dispatch_order = a.dispatch_order AND td.isactive = 'Y'
) c
CROSS APPLY (
   SELECT
      td.po,
      td.outbound_qty
   FROM DV_DATA_LAKE.dbo.dv_truckload_delivery td
   WHERE td.dispatch_order = a.dispatch_order AND td.isactive = 'Y'
   FOR JSON PATH
) AS d (delivery_details)
OUTER APPLY (
   -- Kiểm tra xem có snapshot nào trong 15 phút trước container_sealing_time không
   SELECT TOP (1) CAST(1 AS TINYINT) AS possible_signing_late, snap_time, images
   FROM DV_DATA_LAKE.dbo.dv_carlicenseplates e
   WHERE TRIM(UPPER(e.plate_name)) = TRIM(UPPER(a.license_plate))
      AND e.snap_time BETWEEN DATEADD(MINUTE, -30, a.container_sealing_time)
      AND a.container_sealing_time
) f (possible_signing_late, snap_time, images)
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
   , c.total_outbound_qty
   , d.delivery_details