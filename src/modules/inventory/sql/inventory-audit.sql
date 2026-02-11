-- * CTE for PO list
WITH po_list AS (
	SELECT 
		mo_no, 
		STRING_AGG(po, ',') AS po,
		MIN(COALESCE(po, '')) AS actual_po 
	FROM (
		SELECT DISTINCT po, mo_no 
		FROM DV_DATA_LAKE.dbo.dv_invprodmst
		WHERE inv_yearmonth = @0
			AND inv_type = 'FG'
			AND isactive = 'Y'
			AND cofactory_code_mes = @1
	) t
	GROUP BY mo_no
),
-- * Storage list of each command number
storage_list_cte AS (
	SELECT mo_no, 
      STRING_AGG(b.storage_name, ', ') WITHIN GROUP (ORDER BY storage ASC) AS storage_name
	FROM (
		SELECT DISTINCT storage, mo_no 
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
		WHERE storage IS NOT NULL AND dept_name IS NOT NULL
	) a
	LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet b
		ON a.storage = b.storage_num
   LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet c 
      ON a.storage = c.storage_num
	GROUP BY mo_no
),

-- * CTE for aggregated data master
agg_data_mst AS (
	SELECT
		mo_no,
		inv_yearmonth,
		brand_name,
		inv_type,
		shoestyle_cofactory AS factory_shoes_style,
		cofactory_code_mes AS factory_code,
		SUM(ISNULL(mo_qty, 0)) AS mo_qty,
		SUM(ISNULL(inv_initialqty, 0)) AS inv_initialqty,
		SUM(ISNULL(inv_istotalqty, 0)) AS inv_istotalqty,
		SUM(ISNULL(inv_manualqty, 0)) AS inv_manualqty,
		SUM(ISNULL(inv_ostotalqty, 0)) AS inv_ostotalqty,
		SUM(ISNULL(inv_manualqtyout, 0)) AS inv_manualqtyout,
		SUM(ISNULL(inv_finalqty, 0)) AS inv_finalqty
	FROM DV_DATA_LAKE.dbo.dv_invprodmst
	WHERE isactive = 'Y' 
		AND inv_type = 'FG' 
		AND inv_yearmonth = @0
		AND mo_no IS NOT NULL 
		AND mo_no <> 'undefined'
		AND cofactory_code_mes = @1
	GROUP BY
		cofactory_code_mes,
		mo_no,
		inv_yearmonth,
		brand_name,
		shoestyle_cofactory,
		inv_type,
      po
),
-- * CTE for aggregated data
agg_data AS (
	SELECT
		mo_no,
		inv_yearmonth,
		factory_code,
		brand_name,
		factory_shoes_style,
		inv_type,
		MAX(mo_qty) AS mo_qty,
		SUM(inv_initialqty) AS inv_initialqty,
		SUM(inv_istotalqty) AS inv_istotalqty,
		SUM(inv_manualqty) AS inv_manualqty,
		SUM(inv_ostotalqty) AS inv_ostotalqty,
		SUM(inv_manualqtyout) AS inv_manualqtyout,
		SUM(inv_finalqty) AS inv_finalqty
	FROM agg_data_mst
	GROUP BY
		factory_code,
		mo_no,
		factory_shoes_style,
		inv_yearmonth,
		brand_name,
		inv_type
)

-- * Main query
SELECT
a.factory_code,
	a.brand_name,
	CASE 
		WHEN LEFT(p.po, 1) = ',' THEN TRIM(STUFF(p.po, 1, 1, '')) 
		ELSE TRIM(p.po) 
	END AS po,
	ISNULL(p.actual_po, '') actual_po,
	a.mo_no,
	a.factory_shoes_style,
	IIF(d.shoestyle_codecust IS NOT NULL AND d.shoestyle_namecust IS NOT NULL , d.shoestyle_codecust + '/' + d.shoestyle_namecust, NULL) cust_shoes_style,
	c.color_sn,
	s.storage_name AS storage,
   ISNULL(st.total_storage_capacity, 0) AS total_storage_capacity,
   ISNULL(st.total_number_of_storage, 0) AS total_number_of_storage,
	CAST(a.mo_qty AS INT) AS order_qty,
	CAST(a.inv_initialqty AS INT) AS init_inv_qty,
	CAST(a.inv_istotalqty AS INT) AS total_instock_qty,
	CAST(a.inv_ostotalqty AS INT) AS total_outstock_qty,
	CAST(a.inv_manualqty - a.inv_manualqtyout AS INT) AS actual_inv_qty,
	CAST(a.inv_finalqty AS INT) AS final_inv_qty,
	-- * Add get JSON data pipeline for size
	(
		SELECT  
			c.size_numcode AS size,
			CAST(MAX(ISNULL(c.mo_qty, 0)) AS INT) AS order_qty_by_size,
			CAST(SUM(ISNULL(c.inv_initialqty, 0)) AS INT) AS initial_stock_qty,
			CAST(SUM(ISNULL(c.inv_istotalqty, 0)) AS INT) AS instock_qty,
			CAST(SUM(ISNULL(c.inv_ostotalqty, 0)) AS INT) AS outstock_qty,
			CAST(SUM(ISNULL(c.inv_manualqty, 0)) AS INT) AS actual_instock_qty,
			CAST(SUM(ISNULL(c.inv_manualqtyout, 0)) AS INT) AS actual_outstock_qty,
			CAST(SUM(ISNULL(c.inv_finalqty, 0)) AS INT) AS final_stock_qty
		FROM DV_DATA_LAKE.dbo.dv_invprodmst c
		WHERE c.mo_no = a.mo_no
			AND c.inv_yearmonth = a.inv_yearmonth
			AND c.brand_name = a.brand_name
			AND c.inv_type = a.inv_type
			AND c.isactive = 'Y'
			AND c.inv_type = 'FG'
			AND c.inv_yearmonth = @0
		GROUP BY c.size_numcode
		ORDER BY RIGHT('0000' + IIF(CHARINDEX('.', c.size_numcode) > 0, c.size_numcode, c.size_numcode + '.0'), 5) ASC
		FOR JSON PATH
	) AS detail,
	a.inv_type,
	a.inv_yearmonth AS inv_year_month
FROM agg_data a
OUTER APPLY (
   SELECT COUNT(DISTINCT storage_num) AS total_number_of_storage, SUM(ISNULL(storage_capacity, 0)) AS total_storage_capacity
   FROM DV_DATA_LAKE.dbo.dv_warehouseccodedet
) st (total_number_of_storage, total_storage_capacity)
INNER JOIN po_list p ON p.mo_no = a.mo_no
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b ON b.mo_no = a.mo_no AND b.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst c ON c.isactive = 'Y' AND c.mat_code = b.mat_code
LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor d ON d.isactive = 'Y' AND c.shoestyle_templink = d.shoestyle_templink
LEFT JOIN storage_list_cte s ON s.mo_no = a.mo_no
WHERE 
	a.factory_code = @1
	AND (
		CAST(a.inv_initialqty AS INT) <> 0
		OR CAST(a.inv_istotalqty AS INT) <> 0
		OR CAST(a.inv_ostotalqty AS INT) <> 0
		OR CAST(a.inv_manualqty - a.inv_manualqtyout AS INT) <> 0
		OR CAST(a.inv_finalqty AS INT) <> 0
	)
ORDER BY a.mo_no DESC
OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 8, FAST 100);