DECLARE @SQL NVARCHAR(MAX);

SET @SQL = '
SELECT 
	manu.mo_no AS mo_no,
	manu.mat_code,
	cust.shoestyle_codefactory AS shoes_style_code_factory,
	manu.mo_sumqty AS order_qty,
	dept.MES_dept_name AS shaping_dept_name,
	COUNT(DISTINCT inv.EPC_Code) AS inbound_qty,
	CAST(inv.record_time AS DATE) AS inbound_date
FROM ' + @0 + '.DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manu
	ON manu.mo_no = COALESCE(inv.mo_no_actual, inv.mo_no)
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust 
	ON inv.EPC_Code = cust.EPC_Code 
LEFT JOIN DV_DATA_LAKE.dbo.dv_Deptmst dept
	ON dept.ERP_dept_code = inv.dept_code
	AND dept.MES_dept_codeupper = 
      CASE 
         WHEN ''' + @1 + ''' = ''VA1'' THEN ''YS06''
         WHEN ''' + @1 + ''' = ''VB1'' THEN ''SS06''
         WHEN ''' + @1 + ''' = ''VB2'' THEN ''SS07''
         WHEN ''' + @1 + ''' = ''CA1'' THEN ''CS07''
         ELSE dept.MES_dept_codeupper
      END
WHERE manu.cofactory_code = ''' + @1 + '''
	AND inv.rfid_status IS NOT NULL
	AND CAST(inv.record_time AS DATE) = CAST(GETDATE() AS DATE)
	AND cust.ri_cancel = 0 
GROUP BY manu.mo_no,
   manu.mat_code,
   cust.shoestyle_codefactory,
   dept.MES_dept_name, 
   manu.mo_sumqty,
   CAST(inv.record_time AS DATE)
ORDER BY inbound_qty DESC';

EXEC(@SQL);