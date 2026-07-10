export default /* SQL */ `
MERGE INTO DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS target
USING (
   SELECT JSON_VALUE(value, '$.epc') AS EPC_Code,
      JSON_VALUE(value, '$.mo_no') AS mo_no,
      JSON_VALUE(value, '$.mat_code') AS mat_code,
      JSON_VALUE(value, '$.mo_noseq') AS mo_noseq,
      JSON_VALUE(value, '$.or_no') AS or_no,
      JSON_VALUE(value, '$.or_cust_po') AS or_custpo,
      JSON_VALUE(value, '$.factory_shoes_style') AS shoestyle_codefactory,
      JSON_VALUE(value, '$.cust_shoes_style') AS cust_shoestyle,
      JSON_VALUE(value, '$.size_code') AS size_code,
      JSON_VALUE(value, '$.size_numcode') AS size_numcode,
      JSON_VALUE(value, '$.factory_code_orders') AS factory_code_orders,
      JSON_VALUE(value, '$.factory_name_orders') AS factory_name_orders,
      JSON_VALUE(value, '$.factory_code_produce') AS factory_code_produce,
      JSON_VALUE(value, '$.factory_name_produce') AS factory_name_produce,
      CAST(JSON_VALUE(value, '$.size_qty') AS INT) AS size_qty,
      JSON_VALUE(value, '$.remark') AS remark
   FROM OPENJSON(@0)
) AS source
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
   )
-- * Note: Do not update because some of EPCs already exchanged command number
-- WHEN MATCHED THEN 
--    UPDATE SET 
--       target.mo_no = source.mo_no, 
--       target.remark = source.remark
;

`
