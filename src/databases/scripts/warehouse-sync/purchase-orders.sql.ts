export const PURCHASE_ORDERS_SQL = /* SQL */ `
			WITH     CTE_PO_SOURCE AS
					(SELECT source.*,
							ROW_NUMBER() OVER (
								PARTITION BY source.po
								ORDER BY (CASE WHEN source.ship_type IS NOT NULL THEN 1 ELSE 0 END
									+ CASE WHEN source.destCountry IS NOT NULL THEN 1 ELSE 0 END) DESC,
									DATALENGTH(source.ship_type), CONVERT(NVARCHAR(MAX), source.ship_type) COLLATE Latin1_General_100_BIN2,
									DATALENGTH(source.destCountry), CONVERT(NVARCHAR(MAX), source.destCountry) COLLATE Latin1_General_100_BIN2,
									source.po_totalqty,
									DATALENGTH(source.brand), CONVERT(NVARCHAR(MAX), source.brand) COLLATE Latin1_General_100_BIN2,
									DATALENGTH(source.shoestyle_codefactory), CONVERT(NVARCHAR(MAX), source.shoestyle_codefactory) COLLATE Latin1_General_100_BIN2,
									DATALENGTH(source.shoestyle_codecust), CONVERT(NVARCHAR(MAX), source.shoestyle_codecust) COLLATE Latin1_General_100_BIN2,
									DATALENGTH(source.shoestyle_namecust), CONVERT(NVARCHAR(MAX), source.shoestyle_namecust) COLLATE Latin1_General_100_BIN2,
									DATALENGTH(source.color_sn), CONVERT(NVARCHAR(MAX), source.color_sn) COLLATE Latin1_General_100_BIN2
							) AS source_rank
					FROM DV_DATA_LAKE.dbo.dv_OrderProcessR05 AS source),
						CTE
			AS       (SELECT orp05.po,
								po_type,
								mfd.mo_no,
								orp05.po_totalqty AS order_qty,
								UPPER(orp05.ship_type) AS shipping_method,
								orp05.destCountry AS shipping_destination,
								orp05.brand AS brand_name,
								orp05.shoestyle_codefactory AS factory_shoes_style,
								CONCAT(orp05.shoestyle_codecust, '/', orp05.shoestyle_namecust) AS cust_shoes_style,
								orp05.color_sn,
								orp05.XF_Date,
								wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(sr.size_numcode) AS size_numcode,
								sr.size_qty
						FROM   wuerp_vnrd.dbo.ta_ordermst AS ord
								INNER JOIN
								CTE_PO_SOURCE AS orp05
								ON orp05.po = IIF (ISNULL(ord.or_custpoone, '') = '', ord.or_custpo, ord.or_custpoone)
									AND orp05.source_rank = 1
								INNER JOIN
								wuerp_vnrd.dbo.ta_manufacturdet AS mfd
								ON mfd.or_no = ord.or_no
								INNER JOIN
								wuerp_vnrd.dbo.ta_ordersizerun AS osr
								ON osr.or_no = ord.or_no CROSS APPLY (VALUES ([size_numcode01], [size_qty01] - [size_qtycancel01]), ([size_numcode02], [size_qty02] - [size_qtycancel02]), ([size_numcode03], [size_qty03] - [size_qtycancel03]), ([size_numcode04], [size_qty04] - [size_qtycancel04]), ([size_numcode05], [size_qty05] - [size_qtycancel05]), ([size_numcode06], [size_qty06] - [size_qtycancel06]), ([size_numcode07], [size_qty07] - [size_qtycancel07]), ([size_numcode08], [size_qty08] - [size_qtycancel08]), ([size_numcode09], [size_qty09] - [size_qtycancel09]), ([size_numcode10], [size_qty10] - [size_qtycancel10]), ([size_numcode11], [size_qty11] - [size_qtycancel11]), ([size_numcode12], [size_qty12] - [size_qtycancel12]), ([size_numcode13], [size_qty13] - [size_qtycancel13]), ([size_numcode14], [size_qty14] - [size_qtycancel14]), ([size_numcode15], [size_qty15] - [size_qtycancel15]), ([size_numcode16], [size_qty16] - [size_qtycancel16]), ([size_numcode17], [size_qty17] - [size_qtycancel17]), ([size_numcode18], [size_qty18] - [size_qtycancel18]), ([size_numcode19], [size_qty19] - [size_qtycancel19]), ([size_numcode20], [size_qty20] - [size_qtycancel20]), ([size_numcode21], [size_qty21] - [size_qtycancel21]), ([size_numcode22], [size_qty22] - [size_qtycancel22]), ([size_numcode23], [size_qty23] - [size_qtycancel23]), ([size_numcode24], [size_qty24] - [size_qtycancel24]), ([size_numcode25], [size_qty25] - [size_qtycancel25]), ([size_numcode26], [size_qty26] - [size_qtycancel26]), ([size_numcode27], [size_qty27] - [size_qtycancel27]), ([size_numcode28], [size_qty28] - [size_qtycancel28]), ([size_numcode29], [size_qty29] - [size_qtycancel29]), ([size_numcode30], [size_qty30] - [size_qtycancel30]), ([size_numcode31], [size_qty31] - [size_qtycancel31]), ([size_numcode32], [size_qty32] - [size_qtycancel32]), ([size_numcode33], [size_qty33] - [size_qtycancel33]), ([size_numcode34], [size_qty34] - [size_qtycancel34]), ([size_numcode35], [size_qty35] - [size_qtycancel35]), ([size_numcode36], [size_qty36] - [size_qtycancel36]), ([size_numcode37], [size_qty37] - [size_qtycancel37]), ([size_numcode38], [size_qty38] - [size_qtycancel38]), ([size_numcode39], [size_qty39] - [size_qtycancel39]), ([size_numcode40], [size_qty40] - [size_qtycancel40])) AS sr([size_numcode], [size_qty])
						WHERE  sr.size_qty > 0
								AND ord.isactive = 'Y'),
						CTE_PACKING
			AS       (SELECT   po,
									po_type,
									mo_no,
									order_qty,
									shipping_method,
									shipping_destination,
									brand_name,
									factory_shoes_style,
									cust_shoes_style,
									color_sn,
									CONCAT('"', mo_no, '":{', STRING_AGG(CAST (CONCAT('"', size_numcode, '":', CAST (size_qty AS INT)) AS NVARCHAR (MAX)), ',') WITHIN GROUP (ORDER BY CAST (size_numcode AS FLOAT) ASC), '}') AS mo_packing
						FROM     CTE
						GROUP BY po, po_type, mo_no, order_qty, shipping_method, shipping_destination, brand_name, factory_shoes_style, cust_shoes_style, color_sn),
						CTE_SIZE_LEDGER
			AS       (SELECT   po,
									size_numcode,
									SUM(CAST(ISNULL(size_qty, 0) AS INT)) AS total_qty
						FROM     CTE
						GROUP BY po, size_numcode),
						CTE_OUTBOUND_EPCS
			AS       (SELECT EPC_Code, size_code, po
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
						WHERE  station_suffix = '103' AND record_time < @cutoff
						UNION
						SELECT EPC_Code, size_code, po
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
						WHERE  station_suffix = '103' AND record_time < @cutoff),
						CTE_OUTBOUND_PROGRESS
			AS       (SELECT   po,
									size_code AS size_numcode,
									COUNT(EPC_Code) AS shipped_out_qty
						FROM     CTE_OUTBOUND_EPCS
						GROUP BY po, size_code),
						CTE_PROGRESS
			AS       (SELECT   sl.po,
									CONCAT('{', STRING_AGG(CAST (CONCAT('"', sl.size_numcode, '":{"order_qty":', sl.total_qty, ',"shipped_out_qty":', ISNULL(ob.shipped_out_qty, 0), '}') AS NVARCHAR (MAX)), ',') WITHIN GROUP (ORDER BY CAST (sl.size_numcode AS FLOAT) ASC), '}') AS shipping_progress
						FROM     CTE_SIZE_LEDGER AS sl
									LEFT OUTER JOIN
									CTE_OUTBOUND_PROGRESS AS ob
									ON ob.po = sl.po
										AND ob.size_numcode = sl.size_numcode
						GROUP BY sl.po)
			SELECT   pk.po,
						pk.order_qty,
						pk.shipping_method,
						pk.shipping_destination,
						pk.brand_name,
						pk.factory_shoes_style,
						pk.cust_shoes_style,
						pk.color_sn,
						CONCAT('{', STRING_AGG(pk.mo_packing, ','), '}') AS packing,
						MAX(prg.shipping_progress) AS shipping_progress
			FROM     CTE_PACKING AS pk
						INNER JOIN
						CTE_PROGRESS AS prg
						ON prg.po = pk.po
			GROUP BY pk.po, pk.order_qty, pk.shipping_method, pk.shipping_destination, pk.brand_name, pk.factory_shoes_style, pk.cust_shoes_style, pk.color_sn;
		`
