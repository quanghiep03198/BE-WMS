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
        br.brand_name,
        sfm.shoestyle_codefactory AS factory_shoes_style,
        prod.color_sn,
        dd.outbound_qty
    FROM DV_DATA_LAKE.dbo.dv_truckload_delivery dd
    LEFT JOIN wuerp_vnrd.dbo.ta_ordermst ord ON IIF(ISNULL(ord.or_custpoone, '') = '', ord.or_custpo, ord.or_custpoone) = dd.po AND ord.isactive = 'Y'
    LEFT JOIN wuerp_vnrd.dbo.ta_productmst prod ON prod.mat_code = ord.mat_code AND prod.isactive = 'Y'
    LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst sfm ON sfm.shoestyle_systemcodefty = prod.shoestyle_systemcodefty
    LEFT JOIN wuerp_vnrd.dbo.ta_brand br ON br.custbrand_id = ord.custbrand_id
    WHERE dd.dispatch_order = a.dispatch_order AND dd.isactive = 'Y'
    FOR JSON PATH
) AS c (delivery_details)
WHERE a.isactive = 'Y'
   AND (
      (@0 IS NOT NULL AND @1 IS NOT NULL AND a.created BETWEEN @0 AND @1)
      OR (@0 IS NOT NULL AND @1 IS NULL AND a.created >= @0)
      OR (@0 IS NULL AND @1 IS NOT NULL AND a.created <= @1)
      OR (@0 IS NULL AND @1 IS NULL)
   )
   AND (
      @2 IS NULL 
      OR (@2 IS NOT NULL AND a.approval_status = @2)
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

