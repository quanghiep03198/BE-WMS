MERGE INTO dv_rfidmatchmst_cust AS target
USING (VALUES :values) AS source (
   EPC_Code, mo_no, mat_code, mo_noseq, or_no,
   or_custpo, shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
   factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty
)
ON target.EPC_Code = source.EPC_Code
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
      shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
      factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, 
      isactive, created, ri_date, ri_type, ri_foot, ri_cancel
   )
   VALUES (
      source.EPC_Code, source.mo_no, source.mat_code, source.mo_noseq, source.or_no, 
      source.or_custpo, source.shoestyle_codefactory, source.cust_shoestyle, source.size_code, source.size_numcode,
      source.factory_code_orders, source.factory_name_orders, source.factory_code_produce, source.factory_name_produce, source.size_qty, 
      'Y', GETDATE(), CAST(GETDATE() AS DATE), 'A', 'A', 0
   );