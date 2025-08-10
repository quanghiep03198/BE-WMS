DECLARE 
   @undeleted_epcs NVARCHAR(MAX) = @0, 
   @scanned_epcs NVARCHAR(MAX) = @1,
   @offset INT = @2,
   @limit INT = @3,
   @epc_like NVARCHAR(50) = @4,
   @factory_shoes_style NVARCHAR(50) = @5,
   @color_sn NVARCHAR(10) = @6,
   @size_code NVARCHAR(5) = @7,
   @mo_no NVARCHAR(10) = @8,
   @scanned BIT = @9
;

WITH
   undeleted_epcs
   AS
   (
      SELECT value AS EPC_Code
      FROM OPENJSON(@undeleted_epcs)
   ),
   scanned_epcs
   AS
   (
      SELECT JSON_VALUE(value, '$.epc') AS EPC_Code, JSON_VALUE(value, '$.stored_at') AS stored_at, CAST(1 AS BIT) AS scanned
      FROM OPENJSON(@scanned_epcs)
   )
SELECT COUNT(DISTINCT a.EPC_Code) AS count
FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily a WITH(NOLOCK)
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b
   ON a.mo_no = b.mo_no AND b.isactive = 'Y' AND b.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
LEFT JOIN wuerp_vnrd.dbo.ta_productmst c 
   ON c.mat_code = b.mat_code AND c.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst d 
   ON d.shoestyle_systemcodefty = c.shoestyle_systemcodefty AND d.isactive = 'Y'
LEFT JOIN (SELECT EPC_Code, stored_at, scanned FROM scanned_epcs) e 
   ON a.EPC_Code = e.EPC_Code
WHERE a.rfid_status = 'A' 
   AND RIGHT(a.stationNO, 3) = '101' 
   AND LEFT(a.EPC_Code, 3) <> 'E28' 
   AND LEFT(a.EPC_Code, 6) <> '303429' 
   AND NOT EXISTS (
      SELECT 1
      FROM undeleted_epcs
      WHERE EPC_Code = a.EPC_Code
   ) 
   AND (@epc_like IS NULL  OR a.EPC_Code LIKE CONCAT('%', @epc_like, '%')) 
   AND (@factory_shoes_style IS NULL  OR d.shoestyle_codefactory = @factory_shoes_style) 
   AND (@color_sn IS NULL  OR c.color_sn = @color_sn) 
   AND (@mo_no IS NULL  OR a.mo_no = @mo_no) 
   AND (@size_code IS NULL  OR a.size_code = @size_code) 
   AND (@scanned IS NULL OR CAST(COALESCE(e.scanned, 0) AS BIT) = CAST(@scanned AS BIT)) 
   AND NOT EXISTS (
      SELECT 1
      FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
      WHERE EPC_Code = a.EPC_Code
         AND rfid_status = 'B'
         AND RIGHT(stationNO, 3) = '103'
   )
OPTION(
   OPTIMIZE FOR UNKNOWN,
   USE HINT ('ENABLE_PARALLEL_PLAN_PREFERENCE'),
   HASH JOIN,
   RECOMPILE
)