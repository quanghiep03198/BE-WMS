SELECT DISTINCT
  a.inv_yearmonth --month
, a.brand_name --Brand
, a.shoestyle_cofactory -- Factory Type 工廠型體
, a.cust_shoestyle -- 客戶型體
, a.mo_no --
, a.po
, SUM(a.mo_qty)[mo_qty] --TOTAL OF mo_qty 指令數量
, SUM(a.inv_initialqty)[init_inv_qty] --TOTAL OF Beginning Inventory 期初庫存
, (SUM(a.inv_istotalqty) + SUM(inv_manualqty))[total_instock_qty] -- TOTAL OF Inventory In 入庫
, (SUM(a.inv_ostotalqty) + SUM(inv_manualqtyout))[total_outstock_qty] -- TOTAL OF Inventory Out 出庫
, (SUM(inv_manualqty)) - (SUM(inv_manualqtyout))[actual_inv_qty] -- TOTAL OF Inventory Out 盤盈
, SUM(a.inv_finalqty)[final_inv_qty] --TOTAL OF Ending Inventory 期末數量
, CAST('['+
   STRING_AGG(
      '{' 
         +'"size":' + '"' + a.size_numcode + '"' --Size
         +',"ms_qty":' + CAST(CAST(a.mo_qty AS INT) AS NVARCHAR(50)) + --指令數量 mo_qty of current size
         +',"int_qty":' + CAST(CAST(a.inv_initialqty AS INT) AS NVARCHAR(50)) + --Beginning Inventory 期初庫存
         +',"ist_qty":' + CAST(CAST(a.inv_istotalqty AS INT)  AS NVARCHAR(50)) + --Inventory In 入庫
         +',"mn_ist_qty":' + CAST(CAST(a.inv_manualqty AS INT)  AS NVARCHAR(50)) + --Manual Inventory InManual  手填入庫
         +',"ost_qty":' +CAST(CAST(a.inv_ostotalqty AS INT) AS NVARCHAR(50)) + --Inventory Out 出庫
         +',"mn_ost_qty":' + CAST(CAST(a.inv_manualqtyout AS INT) AS NVARCHAR(50)) + --Manual Inventory Out 手填出庫
         +',"fnl_qty":' +CAST(CAST(ISNULL(a.inv_finalqty,0) AS INT) AS NVARCHAR(50)) + --Ending Inventory 期末數量
      '}',
      ','
   ) 
   WITHIN GROUP (
      ORDER BY RIGHT('0000' + IIF(CHARINDEX('.', a.size_numcode) > 0, a.size_numcode,a.size_numcode + '.0'), 5) ASC
   ) 
   + ']' AS NVARCHAR(MAX)) AS size_data
, a.remark
FROM [dbo].[dv_invprodmst] a
WHERE 
   a.isactive='Y' 
   AND a.inv_type='FG'
   AND a.inv_yearmonth = @0
GROUP BY
   a.inv_yearmonth
   ,a.brand_name
   ,a.shoestyle_cofactory
   ,a.mo_no
   ,a.remark
   ,a.inv_type
   ,a.cust_shoestyle
   ,a.po