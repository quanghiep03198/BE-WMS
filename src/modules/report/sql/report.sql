WITH RankedData AS (
    SELECT
        inv.mo_no,
        manu.mat_code,
        cust.shoestyle_codefactory AS shoes_style_code_factory,
        manu.mo_sumqty AS order_qty,
        dept.MES_dept_name AS shaping_dept_name,
        COUNT(inv.EPC_Code) AS inbound_qty,
        FORMAT(inv.record_time, 'yyyy-MM-dd') AS inbound_date,
        ROW_NUMBER() OVER (PARTITION BY inv.mo_no ORDER BY cust.shoestyle_codefactory DESC) AS row_num
    FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv 
    LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manu
        ON manu.mo_no = inv.mo_no
    LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust cust 
        ON inv.EPC_Code = cust.EPC_Code 
        AND manu.mo_no = cust.mo_no
		AND inv.record_time IS NOT NULL
    LEFT JOIN DV_DATA_LAKE.dbo.dv_Deptmst dept
        ON dept.ERP_dept_code = inv.dept_code
        AND dept.MES_dept_codeupper = CASE 
            WHEN @0 = 'VA1' THEN 'YS06'
            WHEN @0 = 'VB1' THEN 'SS06'
            WHEN @0 = 'VB2' THEN 'SS07'
            WHEN @0 = 'CA1' THEN 'CS07'
            ELSE MES_dept_codeupper
        END
    WHERE manu.cofactory_code = @0
      AND inv.rfid_status IS NOT NULL
      AND FORMAT(inv.record_time, 'yyyy-MM-dd') = @1
	  AND cust.ri_cancel = 0
    GROUP BY inv.mo_no,
             manu.mat_code,
             cust.shoestyle_codefactory,
             dept.MES_dept_name, 
             manu.mo_sumqty,
             FORMAT(inv.record_time, 'yyyy-MM-dd')
)
SELECT 
    mo_no,
    mat_code,
    shoes_style_code_factory, -- Get by first value of ROW_NUMBER
    order_qty,
    shaping_dept_name,
    inbound_qty,
    inbound_date
FROM RankedData
WHERE row_num = 1
ORDER BY inbound_date DESC;