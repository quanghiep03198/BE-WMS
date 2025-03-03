SELECT b.mo_no, b.size_numcode, COUNT(b.keyid)[qty] FROM(
SELECT EPC_cODE, mo_no FROM dv_InvRFIDrecorddet_backup_Daily 
where stationNO IN ( 'CUS_VB2_WH101', 'CUS_VB2_WH102') AND mo_no='{mo_no}'
UNION ALL
SELECT EPC_cODE, mo_no FROM dv_InvRFIDrecorddet 
where stationNO IN ( 'CUS_VB2_WH101', 'CUS_VB2_WH102') AND mo_no='{mo_no}'
)a 
LEFT JOIN dv_rfidmatchmst_cust b ON a.EPC_Code=b.EPC_Code where b.mo_no='{mo_no}'
GROUP BY b.mo_no, b.size_numcode ORDER BY b.mo_no, b.size_numcode


SELECT b.mo_no, b.size_numcode, COUNT(b.keyid)[qty] FROM(
SELECT EPC_cODE, mo_no FROM dv_InvRFIDrecorddet_backup_Daily 
where stationNO IN ( 'CUS_VB2_WH103', 'CUS_VB2_WH103') AND mo_no='{mo_no}'
UNION ALL
SELECT EPC_cODE, mo_no FROM dv_InvRFIDrecorddet 
where stationNO IN ( 'CUS_VB2_WH103', 'CUS_VB2_WH103') AND mo_no='{mo_no}'
)a 
LEFT JOIN dv_rfidmatchmst_cust b ON a.EPC_Code=b.EPC_Code where b.mo_no='{mo_no}'
GROUP BY b.mo_no, b.size_numcode ORDER BY b.mo_no, b.size_numcode