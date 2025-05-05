-- * CTE for PurchaseOrderList list
WITH PurchaseOrderList AS (
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

-- * CTE for aggregated data
AggregatedData AS (
	SELECT
		mo_no,
		inv_yearmonth,
		brand_name,
		shoestyle_cofactory,
		cust_shoestyle,
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
	GROUP BY
		mo_no,
		inv_yearmonth,
		brand_name,
		shoestyle_cofactory,
		cust_shoestyle,
		inv_type
)

-- * Stage 0: Main query
SELECT
	a.mo_no,
	a.inv_yearmonth AS inv_year_month,
	a.brand_name,
	a.shoestyle_cofactory AS shoes_style_code_factory,
	a.cust_shoestyle,
	a.inv_type,
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
	-- * Stage 2: JSON data for size
	(
		SELECT  
			c.size_numcode AS size,
			CAST(MAX(c.mo_qty) AS INT) AS ms_qty,
			CAST(SUM(c.inv_initialqty) AS INT) AS int_qty,
			CAST(SUM(c.inv_istotalqty) AS INT) AS ist_qty,
			CAST(SUM(c.inv_manualqty) AS INT) AS mn_ist_qty,
			CAST(SUM(c.inv_ostotalqty) AS INT) AS ost_qty,
			CAST(SUM(c.inv_manualqtyout) AS INT) AS mn_ost_qty,
			CAST(SUM(ISNULL(c.inv_finalqty, 0)) AS INT) AS fnl_qty
		FROM DV_DATA_LAKE.dbo.dv_invprodmst c WITH (NOLOCK)
		WHERE c.mo_no = a.mo_no
			AND c.inv_yearmonth = a.inv_yearmonth
			AND c.brand_name = a.brand_name
			AND c.shoestyle_cofactory = a.shoestyle_cofactory
			AND c.inv_type = a.inv_type
			AND c.cust_shoestyle = a.cust_shoestyle
			AND c.isactive = 'Y'
			AND c.inv_type = 'FG'
			AND c.inv_yearmonth = @0
		GROUP BY c.size_numcode
		ORDER BY RIGHT('0000' + IIF(CHARINDEX('.', c.size_numcode) > 0, c.size_numcode, c.size_numcode + '.0'), 5) ASC
		FOR JSON PATH
	) AS size_data
FROM AggregatedData a
INNER JOIN PurchaseOrderList p ON p.mo_no = a.mo_no
ORDER BY a.mo_no DESC
OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 8, FAST 100);