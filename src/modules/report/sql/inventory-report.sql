SELECT DISTINCT
   a.inv_yearmonth AS inv_year_month, --month
   a.brand_name AS brand_name, --Brand
   a.shoestyle_cofactory AS shoes_style_code_factory, -- Factory Type 工廠型體
   a.cust_shoestyle, -- 客戶型體
   a.mo_no,
   a.inv_type,
   STUFF(  
      (
         SELECT ',' + ISNULL(b.PO, '')
         FROM DV_DATA_LAKE.dbo.dv_invprodmst B
         WHERE b.mo_no = A.mo_no
            AND b.inv_yearmonth = a.inv_yearmonth
            AND b.brand_name = a.brand_name
            AND b.shoestyle_cofactory = a.shoestyle_cofactory
            AND b.mo_no = a.mo_no
            AND b.inv_type = a.inv_type
            AND b.cust_shoestyle = a.cust_shoestyle
            AND ISNULL(b.PO,'') <> ''
         GROUP BY ISNULL(b.PO, '')
         FOR XML PATH('')
      ), 1, 1, ''
   ) AS po,
   SUM(a.mo_qty) AS order_qty,  --TOTAL OF mo_qty 指令數量
   SUM(a.inv_initialqty) AS init_inv_qty, --TOTAL OF Beginning Inventory 期初庫存
   (SUM(a.inv_istotalqty) + SUM(inv_manualqty)) AS total_instock_qty, -- TOTAL OF Inventory In 入庫
   (SUM(a.inv_ostotalqty) + SUM(inv_manualqtyout)) AS total_outstock_qty, -- TOTAL OF Inventory Out 出庫
   (SUM(a.inv_istotalqty) + SUM(inv_manualqty)) - (SUM(a.inv_ostotalqty) + SUM(inv_manualqtyout)) AS actual_inv_qty, -- TOTAL OF Inventory Out 盤盈
   SUM(a.inv_finalqty) AS final_inv_qty, --TOTAL OF Ending Inventory 期末數量
   '[' + STUFF(  
      (
         SELECT ',' + '{"size":' + + '"' + c.size_numcode + '"' --Size
            +',"ms_qty":'+ CAST(CAST(max(c.mo_qty) AS FLOAT) AS NVARCHAR(50))+ --指令數量
            +',"int_qty":' + CAST(CAST(sum(c.inv_initialqty) AS FLOAT) AS NVARCHAR(50)) + --Beginning Inventory 期初庫存
            +',"ist_qty":' + CAST(CAST(sum(c.inv_istotalqty) AS FLOAT)  AS NVARCHAR(50)) + --Inventory In 入庫
            +',"mn_ist_qty":' + CAST(CAST(sum(c.inv_manualqty) AS FLOAT)  AS NVARCHAR(50)) + --Inventory In 手填入庫
            +',"ost_qty":' + CAST(CAST(sum(c.inv_ostotalqty) AS FLOAT) AS NVARCHAR(50)) + --Inventory Out 出庫
            +',"mn_ost_qty":' + CAST(CAST(sum(c.inv_manualqtyout) AS FLOAT) AS NVARCHAR(50)) + --Inventory Out 手填出庫
            +',"fnl_qty":' + CAST(CAST(ISNULL(sum(c.inv_finalqty), 0) AS FLOAT) AS NVARCHAR(50)) + --Ending Inventory 期末數量
            '}'
         FROM DV_DATA_LAKE.dbo.dv_invprodmst c
         WHERE c.mo_no = A.mo_no
            AND c.inv_yearmonth = a.inv_yearmonth
            AND c.brand_name = a.brand_name
            AND c.shoestyle_cofactory = a.shoestyle_cofactory
            AND c.mo_no = a.mo_no
            AND c.inv_type = a.inv_type
            AND c.cust_shoestyle = a.cust_shoestyle
         GROUP BY RIGHT('0000' + IIF(CHARINDEX('.', c.size_numcode) > 0, c.size_numcode, c.size_numcode + '.0'), 5),c.size_numcode
         ORDER BY RIGHT('0000' + IIF(CHARINDEX('.', c.size_numcode) > 0, c.size_numcode, c.size_numcode + '.0'), 5) ASC
         FOR XML PATH('')
      ), 1, 1, '') + 
   ']' AS size_data
FROM DV_DATA_LAKE.dbo.dv_invprodmst a
WHERE a.isactive = 'Y' AND a.inv_type = 'FG' AND a.inv_yearmonth = @0
GROUP BY
   a.inv_yearmonth,
   a.brand_name,
   a.shoestyle_cofactory,
   a.mo_no,
   a.inv_type,
   a.cust_shoestyle
-- * Avoid parameter sniffing and set max degree of parallelism;
OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 4);