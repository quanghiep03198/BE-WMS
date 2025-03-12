MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING (VALUES :values) AS source (EPC_Code, mo_no, size_code, stationNO, FC_server_code)
ON target.EPC_Code = source.EPC_Code
WHEN MATCHED THEN
   UPDATE SET 
      created = GETDATE(),
      mo_no = source.mo_no, 
      size_code = source.size_code,
      record_time = GETDATE(), 
      stationNO = source.stationNO,
      FC_server_code = source.FC_server_code,
      dept_code = source.dept_code,
      quantity = -1
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO, FC_server_code, quantity
   )
   VALUES (
      source.EPC_Code, source.mo_no, source.size_code, 'A', 'A', GETDATE(), source.stationNO, source.FC_server_code, -1 
   );