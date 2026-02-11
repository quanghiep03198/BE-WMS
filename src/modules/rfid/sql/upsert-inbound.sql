DECLARE @JsonData NVARCHAR(MAX) = @0;

WITH CTE AS (
   SELECT 
      JSON_VALUE(value, '$.epc') EPC_Code,
      JSON_VALUE(value, '$.mo_no') mo_no,
      JSON_VALUE(value, '$.size_numcode') size_code,
      JSON_VALUE(value, '$.rfid_status') rfid_status,
      JSON_VALUE(value, '$.rfid_use') rfid_use,
      JSON_VALUE(value, '$.station_no') stationNO,
      JSON_VALUE(value, '$.quantity') quantity,
      JSON_VALUE(value, '$.storage') storage,
      JSON_VALUE(value, '$.factory_code') FC_server_code,
      JSON_VALUE(value, '$.dept_code') dept_code,
      JSON_VALUE(value, '$.dept_name') dept_name
   FROM OPENJSON(@JsonData)
)
MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING (
   SELECT * FROM CTE
) AS source
ON target.EPC_Code = source.EPC_Code 
   AND target.mo_no = source.mo_no
   AND target.stationNO = source.stationNO
   AND target.rfid_status = 'A'
WHEN MATCHED THEN
   UPDATE SET 
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
   );
