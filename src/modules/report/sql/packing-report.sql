WITH
   po_list
   AS
   (
      SELECT IIF(ISNULL(a.or_custpoone,'') = '', a.or_custpo, a.or_custpoone)[PO], c.shoestyle_codecust, b.color_sn, SUM(a.or_totalqty)-SUM(a.or_totalcqty)[po_qty]
      FROM wuerp_vnrd.dbo.ta_ordermst a
         LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON a.mat_code=b.mat_code AND b.isactive='Y'
         LEFT JOIN wuerp_vnrd.dbo.ta_shoestylecolor c ON b.shoestyle_templink=c.shoestyle_templink AND c.isactive='Y'
      WHERE a.isactive='Y'
      GROUP BY IIF(ISNULL(a.or_custpoone,'')='', a.or_custpo, a.or_custpoone), c.shoestyle_codecust, b.color_sn
   )
SELECT pk.PO as po, pl.shoestyle_codecust, pl.color_sn, pl.po_qty, COUNT(DISTINCT Series_number) qty
FROM DV_DATA_LAKE.dbo.PackingPlan pk
   LEFT JOIN po_list pl ON pk.PO = pl.PO
GROUP BY pk.PO,pl.shoestyle_codecust,pl.color_sn, pl.po_qty