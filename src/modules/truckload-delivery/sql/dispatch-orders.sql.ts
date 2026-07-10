export default /* SQL */ `
SELECT
   a.dispatch_order
   , MIN(a.created) AS created_at
   , ISNULL(MAX(b.images), MAX(c.images)) AS license_plate_image
   , a.factory_code
   , a.approval_status
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , d.total_outbound_qty AS total_outbound_qty
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , a.factory_departure_time
   , MAX(c.snap_time) AS actual_snap_time
   , ISNULL(MAX(b.snap_time), MAX(c.snap_time)) AS actual_departure_time
   , MAX(a.ie_signature) AS ie_signature
   , MAX(a.warehouse_officer_signature) AS warehouse_officer_signature
   , MAX(a.security_1_signature) AS security_1_signature
   , MAX(a.security_2_signature) AS security_2_signature
   -- * possible_signing_late = 1 chỉ khi:
   -- * 1. Có snapshot trong 15 phút TRƯỚC container_sealing_time (c.possible_signing_late = 1)
   -- * 2. VÀ xe thực sự đã xuất hiện SAU khi đóng container (MAX(b.snap_time) IS NOT NULL)
   , CAST(
      MAX(CASE WHEN c.possible_signing_late = 1 AND b.snap_time IS NULL THEN 1 ELSE 0 END)
   AS BIT) AS possible_signing_late
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
LEFT JOIN DV_DATA_LAKE.dbo.dv_carlicenseplates b
   ON TRIM(UPPER(a.license_plate)) = TRIM(UPPER(b.plate_name))
   AND b.snap_time
      BETWEEN DATEADD(MINUTE, 1, a.container_sealing_time)
      AND DATEADD(MINUTE, 30, a.factory_departure_time)
OUTER APPLY (
   -- Kiểm tra xem có snapshot nào trong 15 phút trước container_sealing_time không
   SELECT TOP (1) CAST(1 AS TINYINT) AS possible_signing_late, snap_time, images
   FROM DV_DATA_LAKE.dbo.dv_carlicenseplates e
   WHERE TRIM(UPPER(e.plate_name)) = TRIM(UPPER(a.license_plate))
      AND e.snap_time BETWEEN DATEADD(MINUTE, -30, a.container_sealing_time)
      AND DATEADD(MINUTE, 30, a.container_sealing_time)
   ORDER BY e.snap_time DESC
) c
OUTER APPLY (
   SELECT SUM(outbound_qty) FROM DV_DATA_LAKE.dbo.dv_truckload_delivery
   WHERE dispatch_order = a.dispatch_order
) d (total_outbound_qty)
WHERE a.isactive = 'Y'
GROUP BY a.dispatch_order
   , a.factory_code
   , a.license_plate
   , a.container_number
   , a.container_sealing_time
   , a.factory_departure_time
   , a.approval_status
   , a.punctured_container
   , a.smelling_container
   , a.moist_container
   , d.total_outbound_qty
`
