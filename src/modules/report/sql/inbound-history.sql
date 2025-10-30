
   SELECT 
   a.FC_Server_Code AS factory_code,
   a.mo_no,
   g.brand_name,
   f.shoestyle_codecust + '/'+ f.shoestyle_codefactory AS shoe_style,
   e.color_sn,
   CAST(COALESCE(b.mo_totalqty, 0) AS INT) AS mo_qty,
   COUNT(DISTINCT a.EPC_Code) AS inbound_qty,
   CAST(a.record_time AS DATE) AS inbound_date
   FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily a WITH (NOLOCK)
   LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b ON a.mo_no = b.mo_no AND b.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet c ON c.mo_no = b.mo_no AND c.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_ordermst d ON   c.or_no = c.or_no AND d.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_productmst e ON e.mat_code = b.mat_code AND e.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst f ON f.shoestyle_systemcodefty = e.shoestyle_systemcodefty AND f.isactive = 'Y'
   LEFT JOIN wuerp_vnrd.dbo.ta_brand g ON g.custbrand_id = e.custbrand_id
   WHERE 
		a.rfid_status = 'A'
		AND a.record_time >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
		AND a.EPC_Code NOT LIKE '303429%'
		AND a.EPC_Code NOT LIKE 'E28%'
		AND a.mo_no NOT IN ('13D05B006', '13A08C003')
      AND a.mo_no = @0
		AND a.stationNO LIKE 'CUS%WH10[12]'
   GROUP BY 
      a.FC_Server_Code, 
      g.brand_name,
      f.shoestyle_codecust + '/' + f.shoestyle_codefactory,
      e.color_sn,
      a.mo_no, 
      CAST(COALESCE(b.mo_totalqty, 0) AS INT),
      CAST(a.record_time AS DATE)
ORDER BY CAST(a.record_time AS DATE) DESC
OPTION (
   OPTIMIZE FOR UNKNOWN,
   KEEPFIXED PLAN
)