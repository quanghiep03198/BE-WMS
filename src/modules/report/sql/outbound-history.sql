SELECT
   a.po,
   ( 
      SELECT
      CAST(SUM(or_totalqty) - SUM(or_totalcqty) AS INT) AS po_qty
      FROM wuerp_vnrd.dbo.ta_ordermst
      WHERE isactive = 'Y' AND IIF(ISNULL(or_custpoone, '') = '', or_custpo, or_custpoone) = a.po
      GROUP BY IIF(ISNULL(or_custpoone, '') = '', or_custpo, or_custpoone)
   ) AS po_qty,
   COUNT(DISTINCT a.EPC_Code) AS outbound_qty,
   g.brand_name,
   f.shoestyle_codefactory AS factory_shoes_style,
   e.color_sn,
   CAST(a.record_time AS DATE) AS outbound_date
FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily a
   LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b ON a.mo_no = b.mo_no AND b.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet c ON c.mo_no = b.mo_no AND c.isactive='Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_productmst e ON e.mat_code= b.mat_code AND e.isactive= 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst f ON f.shoestyle_systemcodefty = e.shoestyle_systemcodefty AND f.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_brand g ON g.custbrand_id = e.custbrand_id
WHERE 
   a.po = @0
   AND a.rfid_status = 'B'
   AND a.rfid_use = 'D'
   AND a.record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
   AND a.EPC_Code NOT LIKE '303429%'
   AND a.EPC_Code NOT LIKE 'E28%'
   AND a.mo_no NOT IN ('13D05B006', '13A08C003')
   AND a.stationNO LIKE 'CUS%WH103'
GROUP BY 
   a.po, 
   f.shoestyle_codefactory, 
   g.brand_name,
   e.color_sn,
   CAST(a.record_time AS DATE)
ORDER BY a.po, CAST(a.record_time AS DATE)

