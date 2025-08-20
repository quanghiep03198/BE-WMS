MERGE INTO DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS target
USING (VALUES :values) AS source (
   EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
   shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
   factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, remark
)
ON target.EPC_Code = source.EPC_Code
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
      shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
      factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, remark,
      isactive, created, ri_date, ri_type, ri_foot, ri_cancel
   )
   VALUES (
      source.EPC_Code, source.mo_no, source.mat_code, source.mo_noseq, source.or_no, 
      source.or_custpo, source.shoestyle_codefactory, source.cust_shoestyle, source.size_code, source.size_numcode,
      source.factory_code_orders, source.factory_name_orders, source.factory_code_produce, source.factory_name_produce, source.size_qty, source.remark,
      'Y', GETDATE(), CAST(GETDATE() AS DATE), 'A', 'A', 0
   );
-- * Note: Do not update because some of EPCs already exchanged command number
-- WHEN MATCHED THEN 
--    UPDATE SET 
      -- target.mo_no = source.mo_no, 
      -- target.mat_code = source.mat_code,
      -- target.mo_noseq = source.mo_noseq,
      -- target.or_no = source.or_no,
      -- target.or_custpo = source.or_custpo,
      -- target.shoestyle_codefactory = source.shoestyle_codefactory,
      -- target.cust_shoestyle = source.cust_shoestyle,
      -- target.size_code = source.size_code,
      -- target.size_numcode = source.size_numcode,
      -- target.factory_code_orders = source.factory_code_orders,
      -- target.factory_name_orders = source.factory_name_orders,
      -- target.factory_code_produce = source.factory_code_produce,
      -- target.factory_name_produce = source.factory_name_produce,
      -- target.size_qty = source.size_qty,
      -- target.remark = source.remark
