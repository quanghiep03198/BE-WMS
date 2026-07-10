export default /* SQL */ `
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
   , c.delivery_details
   , MAX(a.ie_signature) AS ie_signature
   , MAX(a.warehouse_officer_signature) AS warehouse_officer_signature
   , MAX(a.security_1_signature) AS security_1_signature
   , MAX(a.security_2_signature) AS security_2_signature
FROM DV_DATA_LAKE.dbo.dv_truckload_delivery a
LEFT JOIN DV_DATA_LAKE.dbo.dv_carlicenseplates b
ON TRIM(UPPER(a.license_plate)) = TRIM(UPPER(b.plate_name)) 
   AND b.snap_time 
      BETWEEN DATEADD(MINUTE, 1, a.container_sealing_time) 
      AND DATEADD(MINUTE, 30, a.factory_departure_time) 
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


`
