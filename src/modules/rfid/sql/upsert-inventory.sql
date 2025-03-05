MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
USING (
   VALUES :values
)  AS source (
   EPC_Code, mo_no, rfid_status, rfid_use, record_time, stationNO,
   quantity, storage, FC_server_code, dept_code, dept_name
)
ON target.EPC_Code = source.EPC_Code
WHEN MATCHED THEN
   UPDATE SET created = GETDATE()
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, mo_no, rfid_status, rfid_use, record_time, stationNO,
      quantity, storage, FC_server_code, dept_code, dept_name
   )
   VALUES (
      source.EPC_Code, source.mo_no, source.rfid_status, source.rfid_use, CAST(source.record_time AS DATETIME), source.stationNO,
      source.quantity, source.storage, source.FC_server_code, source.dept_code, source.dept_name
   );