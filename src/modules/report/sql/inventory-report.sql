-- DECLARE @0 NVARCHAR(10)='202505';

-- * CTE for PO list
WITH po_list AS (
SELECT 
	mo_no, 
	STRING_AGG(po, ',') AS po,
	MIN(COALESCE(po, '')) AS actual_po 
FROM (
	SELECT DISTINCT po, mo_no 
	FROM DV_DATA_LAKE.dbo.dv_invprodmst WITH (NOLOCK)
	WHERE inv_yearmonth = @0
		AND inv_type = 'FG'
		AND isactive = 'Y'
) t
GROUP BY mo_no
),
-- * CTE for aggregated data master
agg_data_mst AS (
	SELECT
		mo_no,
		inv_yearmonth,
		brand_name,
		inv_type,
		SUM(mo_qty) AS mo_qty,
		SUM(inv_initialqty) AS inv_initialqty,
		SUM(inv_istotalqty) AS inv_istotalqty,
		SUM(inv_manualqty) AS inv_manualqty,
		SUM(inv_ostotalqty) AS inv_ostotalqty,
		SUM(inv_manualqtyout) AS inv_manualqtyout,
		SUM(inv_finalqty) AS inv_finalqty
	FROM DV_DATA_LAKE.dbo.dv_invprodmst WITH (NOLOCK)
	WHERE isactive = 'Y' 
		AND inv_type = 'FG' 
		AND inv_yearmonth = @0
		AND mo_no IS NOT NULL 
		AND mo_no <> 'undefined'
	GROUP BY
		mo_no,
		inv_yearmonth,
		brand_name,
		inv_type,
      po
),
-- * CTE for aggregated data
agg_data AS (
	SELECT
		mo_no,
		inv_yearmonth,
		brand_name,
		inv_type,
		MAX(mo_qty) AS mo_qty,
		SUM(inv_initialqty) AS inv_initialqty,
		SUM(inv_istotalqty) AS inv_istotalqty,
		SUM(inv_manualqty) AS inv_manualqty,
		SUM(inv_ostotalqty) AS inv_ostotalqty,
		SUM(inv_manualqtyout) AS inv_manualqtyout,
		SUM(inv_finalqty) AS inv_finalqty
	FROM agg_data_mst WITH (NOLOCK)
	WHERE inv_type = 'FG' 
	AND inv_yearmonth = @0
	GROUP BY
		mo_no,
		inv_yearmonth,
		brand_name,
		inv_type
)

-- * Main query
SELECT
	a.mo_no,
	a.inv_yearmonth AS inv_year_month,
	a.brand_name,
	a.inv_type,
	(d.shoestyle_codecust) shoes_style_code_factory,
	(ISNULL(d.shoestyle_codecust, '') + '/' +ISNULL(d.shoestyle_namecust, '')) cust_shoestyle,
	c.color_sn,
	CASE 
		WHEN LEFT(p.po, 1) = ',' THEN TRIM(STUFF(p.po, 1, 1, '')) 
		ELSE TRIM(p.po) 
	END AS po,
	ISNULL(p.actual_po, '') actual_po,
	CAST(a.mo_qty AS INT) AS order_qty,
	CAST(a.inv_initialqty AS INT) AS init_inv_qty,
	CAST(a.inv_istotalqty + a.inv_manualqty AS INT) AS total_instock_qty,
	CAST(a.inv_ostotalqty + a.inv_manualqtyout AS INT) AS total_outstock_qty,
	CAST((a.inv_istotalqty + a.inv_manualqty) - (a.inv_ostotalqty + a.inv_manualqtyout) AS INT) AS actual_inv_qty,
	CAST(a.inv_finalqty AS INT) AS final_inv_qty,
	-- * Add get JSON data pipeline for size
	(
		SELECT  
			c.size_numcode AS size,
			CAST(MAX(c.mo_qty) AS INT) AS order_qty_by_size,
			CAST(SUM(c.inv_initialqty) AS INT) AS initial_stock_qty,
			CAST(SUM(c.inv_istotalqty) AS INT) AS instock_qty,
			CAST(SUM(c.inv_ostotalqty) AS INT) AS outstock_qty,
			CAST(SUM(c.inv_manualqty) AS INT) AS actual_instock_qty,
			CAST(SUM(c.inv_manualqtyout) AS INT) AS actual_outstock_qty,
			CAST(SUM(ISNULL(c.inv_finalqty, 0)) AS INT) AS final_stock_qty
		FROM DV_DATA_LAKE.dbo.dv_invprodmst c WITH (NOLOCK)
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
	) AS detail
FROM agg_data a
INNER JOIN po_list p ON p.mo_no = a.mo_no
lEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst b ON b.mo_no = a.mo_no AND b.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst c ON c.isactive = 'Y' AND c.mat_code = b.mat_code
LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor d ON d.isactive = 'Y' AND c.shoestyle_templink = d.shoestyle_templink
ORDER BY a.mo_no DESC
OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 8, FAST 100);