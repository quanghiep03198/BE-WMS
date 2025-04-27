BEGIN TRY
   BEGIN TRANSACTION;

   -- Upsert new outstock records
   MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
   USING (VALUES :values) AS source (EPC_Code, po, mo_no, size_code, stationNO, FC_server_code)
   ON 
      target.EPC_Code = source.EPC_Code 
      AND target.mo_no = source.mo_no
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
         po = source.po,
         rfid_status = 'B',
         rfid_use = 'D'
   WHEN NOT MATCHED THEN
      INSERT (
         EPC_Code, po, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO, FC_server_code, quantity
      )
      VALUES (
         source.EPC_Code, source.po, source.mo_no, source.size_code, 'B', 'D', CAST(GETDATE() AS DATETIME), source.stationNO, source.FC_server_code, -1 
      );

   -- Update existing instock records, to avoid conflict while synchronizing, update both dv_InvRFIDrecorddet & dv_InvRFIDrecorddet_backup_Daily
   MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
   USING (VALUES :values) AS source (EPC_Code, po, mo_no, size_code, stationNO, FC_server_code)
   ON 
      target.EPC_Code = source.EPC_Code 
      AND target.mo_no = source.mo_no
      AND target.size_code = source.size_code
      AND target.rfid_status = 'A'
   WHEN MATCHED THEN UPDATE SET po = source.po;

   MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS target
   USING (VALUES :values) AS source (EPC_Code, po, mo_no, size_code, stationNO, FC_server_code)
   ON 
      target.EPC_Code = source.EPC_Code 
      AND target.mo_no = source.mo_no
      AND target.size_code = source.size_code
      AND target.rfid_status = 'A'
   WHEN MATCHED THEN UPDATE SET po = source.po;

   -- Commit the transaction if everything is successful
   COMMIT TRANSACTION;
END TRY
BEGIN CATCH
   -- Rollback the transaction in case of an error
   ROLLBACK TRANSACTION;

   -- Handle the error
   PRINT 'Error occurred: ' + ERROR_MESSAGE();
END CATCH;


