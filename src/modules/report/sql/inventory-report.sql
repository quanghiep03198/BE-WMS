SELECT 
   a.inv_yearmonth, --month
   a.brand_name, --Brand
   a.shoestyle_cofactory AS shoes_style_code_factory, -- Factory Shoe style factory code
   a.mo_no, -- Command number
   CAST(ISNULL(b.mo_sumqty, 0) AS INT) AS order_qty,
   a.or_no, --Order, 
   a.po, -- Purchase order code
   SUM(a.inv_initialqty) AS init_inv_qty, --TOTAL OF Beginning Inventory
   SUM(a.inv_istotalqty) AS total_instock_qty, -- TOTAL OF Inventory In 
   SUM(a.inv_ostotalqty) AS total_outstock_qty, -- TOTAL OF Inventory Out
   SUM(a.inv_istotalqty) - SUM(a.inv_ostotalqty) AS actual_inv_qty, -- TOTAL OF Inventory Out
   SUM(a.inv_finalqty) AS final_inv_qty, --TOTAL OF Ending Inventory
   ('['+
      STRING_AGG(
         '{"size_numcode": ' + '"'+ a.size_numcode+ '"'  --Size
         + ',"init_inv_qty": ' + CAST(CAST(a.inv_initialqty AS INT) AS NVARCHAR(50)) + -- Beginning Inventory
         + ',"instock_qty": ' + CAST(CAST(a.inv_istotalqty AS INT)  AS NVARCHAR(50)) + -- Inventory In
         + ',"outstock_qty": ' + CAST(CAST(a.inv_ostotalqty AS INT) AS NVARCHAR(50)) + -- Inventory Out
         + ',"final_inv_qty": '+ CAST(CAST(a.inv_finalqty AS INT) AS NVARCHAR(50)) + -- Ending Inventory
         '}', ',')
   +']') AS size_data
FROM DV_DATA_LAKE.dbo.dv_invprodmst a
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b
	ON a.mo_no = b.mo_no
WHERE inv_yearmonth = @0
GROUP BY
   a.inv_yearmonth, 
   a.brand_name, 
   a.shoestyle_cofactory, 
   a.po,
   a.mo_no, 
   a.or_no,
   CAST(ISNULL(b.mo_sumqty, 0) AS INT)

