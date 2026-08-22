export default /* SQL */ `
DECLARE @JsonData NVARCHAR(MAX) = @0;

WITH source_data AS (
   SELECT
      JSON_VALUE(value, '$.epc') AS EPC_Code,
      JSON_VALUE(value, '$.mo_no') AS mo_no,
      JSON_VALUE(value, '$.size_numcode') AS size_code,
      JSON_VALUE(value, '$.status') AS rfid_status,
      JSON_VALUE(value, '$.inventory_ledger_type') AS rfid_use,
      JSON_VALUE(value, '$.station_no') AS stationNO,
      JSON_VALUE(value, '$.storage') AS storage,
      JSON_VALUE(value, '$.factory_code') AS FC_server_code,
      JSON_VALUE(value, '$.dept_code') AS dept_code,
      JSON_VALUE(value, '$.dept_name') AS dept_name,
      CASE WHEN JSON_VALUE(value, '$.status') = 'A' THEN 1 ELSE -1 END AS quantity
   FROM OPENJSON(@JsonData)
)
MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING source_data AS source
ON target.EPC_Code = source.EPC_Code 
   AND target.mo_no = source.mo_no
   AND target.stationNO = source.stationNO
WHEN MATCHED THEN
   UPDATE SET 
      isactive = 'Y',
      created = GETDATE(),
      mo_no = source.mo_no, 
      rfid_status = source.rfid_status, 
      rfid_use = source.rfid_use, 
      record_time = GETDATE(),
      size_code = source.size_code,
      stationNO = source.stationNO,
      quantity = source.quantity,
      storage = source.storage,
      FC_server_code = source.FC_server_code,
      dept_code = source.dept_code,
      dept_name = source.dept_name
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO,
      quantity, storage, FC_server_code, dept_code, dept_name
   )
   VALUES (
      source.EPC_Code, source.mo_no, source.size_code, source.rfid_status, source.rfid_use, GETDATE(), source.stationNO,
      source.quantity, source.storage, source.FC_server_code, source.dept_code, source.dept_name
   )
;
`
