MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING (VALUES :values) AS source (
   EPC_Code, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO,
   quantity, storage, FC_server_code, dept_code, dept_name
)
ON target.EPC_Code = source.EPC_Code AND target.stationNO = source.stationNO
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