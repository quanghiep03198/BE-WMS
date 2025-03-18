SELECT DISTINCT a.EPC_Code AS epc, 
   ISNULL(b.mo_no, @0) AS mo_no,
   COALESCE(c.mat_ecolor, @0) AS mat_ecolor,
   COALESCE(b.shoestyle_codefactory, @0) AS shoes_style_code_factory,
   COALESCE(b.size_numcode, @0) AS size_numcode
FROM (SELECT value AS EPC_Code FROM STRING_SPLIT(@1, ',')) AS a
LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust b ON a.EPC_Code = b.EPC_Code
LEFT JOIN wuerp_vnrd.dbo.ta_productmst c ON b.mat_code = c.mat_code
WHERE 
   a.EPC_Code NOT LIKE @2
   AND (
      b.mo_no IS NULL 
      OR b.mo_no NOT IN (SELECT value AS mo_no FROM STRING_SPLIT(@3, ','))
   )