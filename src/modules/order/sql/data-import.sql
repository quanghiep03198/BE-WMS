/* POP MENU FOR SELECT WHICH mo_no */
/* brand_name品牌, mo_no指令項次, or_no訂單編號, or_custpoone客戶訂單, shoestyle_codefactory工廠型體, prod_color中英顏色, or_deliverdate客戶交期,
   or_deliverdate_confirm確認交貨日, or_totalqty訂單數量, sno_qty已入庫數量, sno_qty_notyet未入庫數量, dep_name港口名稱, dep_destination目的地 */
/* mat_code成品編號, shoestyle_codecust客戶型體, dep_shipdestination港口目的地 */

/*, manum.mo_no, manud.mo_noseq*/


DECLARE @paramCompanyCode NVARCHAR(10) = @0;


SELECT
	brand.custbrand_id,
	brand.brand_name,
	(manud.mo_no + ' - ' + manud.mo_noseq) AS mo_no,
	orderm.or_no,
	orderm.or_custpoone,
	shoef.shoestyle_codefactory,
	(prodm.mat_color + ' / ' + prodm.mat_ecolor) AS prod_color,
	orderm.or_deliverdate,
	orderm.or_deliverdate_confirm,
	CAST((orderm.or_totalqty- orderm.or_totalcqty) AS int) or_totalqty,
	CAST(ISNULL(whio.sno_qty, 0) AS int) sno_qty,
	CAST((orderm.or_totalqty - orderm.or_totalcqty) - ISNULL(whio.sno_qty, 0) AS int) AS sno_qty_notyet,
	shipport.dep_name,
	shipport.dep_destination,
	manum.mat_code,
	(ISNULL(shoec.shoestyle_codecust, '') + ' : ' + ISNULL(shoec.shoestyle_namecust, '')) AS shoestyle_codecust,
	(shipport.dep_shipto + ' / ' + shipport.dep_destination) AS shipping_destination,
	manum.cofactory_code,
	manud.mo_templink
FROM
	wuerp_vnrd.dbo.ta_ordermst orderm
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet manud ON
	manud.mo_templink = orderm.mo_templink
	AND manud.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_brand brand ON
	brand.custbrand_id = orderm.custbrand_id
	AND brand.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_manufacturmst manum ON
	manum.mo_no = manud.mo_no
	AND manum.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_productmst prodm ON
	prodm.mat_code = manum.mat_code
	AND prodm.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst shoef ON
	shoef.shoestyle_systemcodefty = prodm.shoestyle_systemcodefty
	AND shoef.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor shoec ON
	shoec.shoestyle_templink = prodm.shoestyle_templink
	AND shoec.isactive = 'Y'
LEFT JOIN wuerp_vnrd.dbo.ta_deliveryport shipport ON
	shipport.dep_no = orderm.dep_no
	AND shipport.isactive = 'Y'
LEFT JOIN (
	SELECT
		a.mo_no,
		SUM(ISNULL(a.sno_qty, 0))sno_qty
	FROM
		dv_whiodet a
	WHERE
		a.isactive = 'Y'
		AND a.sno_no LIKE 'SN%'
	GROUP BY
		a.mo_no,
		a.mo_templink)
  whio ON
	whio.mo_no = manud.mo_no + ' - ' + manud.mo_noseq
WHERE
	orderm.isactive = 'Y'
	AND manum.custbrand_id IN ('17021822051891700015', '17021822051891700034', '17021822051891700049') /* Deckers ONLY */
	AND orderm.status_cancel <> 'B' /* B: ALL qty cancel*/
	/*AND isnull( CAST ( a.mo_from_record AS varchar ( 5 ) ), '' ) = '' -- Filter conti-order. But actually, conti-order would production*/
	AND orderm.status_production <> '1012'
	AND orderm.status_outstore <> '1032'
    AND manum.cofactory_code =  @0;
