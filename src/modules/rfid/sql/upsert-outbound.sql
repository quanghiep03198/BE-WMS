
DECLARE @JsonData NVARCHAR(MAX) = @0;

WITH CTE AS (
   SELECT 
      JSON_VALUE(value, '$.epc') EPC_Code,
      JSON_VALUE(value, '$.po') po,
      JSON_VALUE(value, '$.mo_no') mo_no,
      JSON_VALUE(value, '$.size_numcode') size_code,
      JSON_VALUE(value, '$.station_no') stationNO,
      JSON_VALUE(value, '$.factory_code') FC_server_code
   FROM OPENJSON(@JsonData)
)
MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
-- USING (VALUES :values) AS source (EPC_Code, po, mo_no, size_code, stationNO, FC_server_code)
USING (
   SELECT * FROM CTE
) AS source
ON 
   target.EPC_Code = source.EPC_Code 
   AND target.mo_no = source.mo_no
   AND target.stationNO = source.stationNO
   AND target.rfid_status = 'B'
   AND target.rfid_use = 'D'
WHEN MATCHED THEN
   UPDATE SET 
      isactive = 'Y',
      po = source.po,
      mo_no = source.mo_no, 
      size_code = source.size_code,
      stationNO = source.stationNO,
      FC_server_code = source.FC_server_code,
      created = CAST(GETDATE() AS DATETIME),
      record_time = CAST(GETDATE() AS DATETIME), 
      quantity = -1,
      rfid_status = 'B',
      rfid_use = 'D'
WHEN NOT MATCHED THEN
   INSERT (
      EPC_Code, po, mo_no, size_code, rfid_status, rfid_use, record_time, stationNO, FC_server_code, quantity
   )
   VALUES (
      source.EPC_Code, source.po, source.mo_no, source.size_code, 'B', 'D', CAST(GETDATE() AS DATETIME), source.stationNO, source.FC_server_code, -1 
   );

