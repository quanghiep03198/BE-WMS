MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING (VALUES :values) AS source (EPC_Code, po, mo_no, size_code, stationNO, FC_server_code)
ON 
   target.EPC_Code = source.EPC_Code 
   AND target.po = source.po
   AND target.stationNO = source.stationNO
WHEN MATCHED THEN
   UPDATE SET 
      created = CAST(GETDATE() AS DATETIME),
      mo_no = source.mo_no, 
      size_code = source.size_code,
      record_time = CAST(GETDATE() AS DATETIME), 
      stationNO = source.stationNO,
      FC_server_code = source.FC_server_code,
      quantity = -1,
      po = source.po
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, po, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO, FC_server_code, quantity
   )
   VALUES (
      source.EPC_Code, source.po, source.mo_no, source.size_code, 'B', 'D', CAST(GETDATE() AS DATETIME), source.stationNO, source.FC_server_code, -1 
   );