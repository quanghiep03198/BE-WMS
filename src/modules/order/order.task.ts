import { SuperJson } from '@common/utils'
import { DATA_SOURCE_ERP, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	ManufacturingOrder,
	ManufacturingOrderDocument,
	ManufacturingOrderModel
} from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderModel } from '@modules/order/schemas/purchase-order.schema'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { isEqual } from 'date-fns'
import { flatten } from 'flat'
import pick from 'lodash/pick'
import { AnyBulkWriteOperation } from 'mongoose'
import { InjectPinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'

/**
 * @description - This task is responsible for syncing ERP orders into the system.
 */
@Injectable()
export class OrderTask {
	constructor(
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSource: DataSource,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectPinoLogger(OrderTask.name) private readonly logger
	) {}

	@Cron(CronExpression.EVERY_5_MINUTES, { name: 'SYNC_MANUFACTURING_ORDER_EVERY_5_MINUTES' })
	public async handleSyncManufacturingOrder() {
		let currentCheckpoint = await this.cacheManager.get<{ created: Date; updated: Date }>(
			'cached:checkpoints:sync_manufacturing_order'
		)

		const [lastCheckpoint] = await this.dataSource.query<Array<{ created: Date; updated: Date }>>(/* SQL */ `
         SELECT MAX(mf.created) AS created,
               MAX(mf.updated) AS updated
         FROM   wuerp_vnrd.dbo.ta_manufacturmst AS mf
               INNER JOIN
               wuerp_vnrd.dbo.ta_brand AS br
               ON mf.custbrand_id = br.custbrand_id
                  AND br.brand_code IN ('UG', 'KB', 'TV')
      `)

		if (
			isEqual(currentCheckpoint?.created, lastCheckpoint.created) &&
			isEqual(currentCheckpoint?.updated, lastCheckpoint.updated)
		) {
			this.logger.info('No manufacturing order to sync, last checkpoint is equal to result.')
			return
		}

		currentCheckpoint ??= lastCheckpoint

		const manufacturingOrders = await this.dataSource.query<Array<ManufacturingOrder>>(
			/* SQL */ `
			WITH     CTE_RECENT_MO
			AS       (SELECT DISTINCT mo_no
						FROM   wuerp_vnrd.dbo.ta_manufacturmst
						WHERE  created >= CAST (@0 AS DATETIME)
								OR updated >= CAST (@1 AS DATETIME)),
						CTE_RECENT_MO_SIZE_RUN
			AS       (SELECT   mfs.mo_no,
									wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(sr.size_numcode) AS size_numcode,
									SUM(sr.size_qty) AS size_qty
						FROM     wuerp_vnrd.dbo.ta_manufactursizerun AS mfs CROSS APPLY (VALUES ([size_numcode01], [size_qty01]), ([size_numcode02], [size_qty02]), ([size_numcode03], [size_qty03]), ([size_numcode04], [size_qty04]), ([size_numcode05], [size_qty05]), ([size_numcode06], [size_qty06]), ([size_numcode07], [size_qty07]), ([size_numcode08], [size_qty08]), ([size_numcode09], [size_qty09]), ([size_numcode10], [size_qty10]), ([size_numcode11], [size_qty11]), ([size_numcode12], [size_qty12]), ([size_numcode13], [size_qty13]), ([size_numcode14], [size_qty14]), ([size_numcode15], [size_qty15]), ([size_numcode16], [size_qty16]), ([size_numcode17], [size_qty17]), ([size_numcode18], [size_qty18]), ([size_numcode19], [size_qty19]), ([size_numcode20], [size_qty20]), ([size_numcode21], [size_qty21]), ([size_numcode22], [size_qty22]), ([size_numcode23], [size_qty23]), ([size_numcode24], [size_qty24]), ([size_numcode25], [size_qty25]), ([size_numcode26], [size_qty26]), ([size_numcode27], [size_qty27]), ([size_numcode28], [size_qty28]), ([size_numcode29], [size_qty29]), ([size_numcode30], [size_qty30]), ([size_numcode31], [size_qty31]), ([size_numcode32], [size_qty32]), ([size_numcode33], [size_qty33]), ([size_numcode34], [size_qty34]), ([size_numcode35], [size_qty35]), ([size_numcode36], [size_qty36]), ([size_numcode37], [size_qty37]), ([size_numcode38], [size_qty38]), ([size_numcode39], [size_qty39]), ([size_numcode40], [size_qty40])) AS sr([size_numcode], [size_qty])
						WHERE    mfs.mo_no IN (SELECT mo_no
														FROM   CTE_RECENT_MO)
									AND sr.size_qty > 0
						GROUP BY mfs.mo_no, wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(sr.size_numcode)),
						CTE_RECENT_MO_SIZE_LEDGER
			AS       (SELECT   mo_no,
									CONCAT('{', STRING_AGG(CONCAT('"', size_numcode, '":{', '"order_qty":', CAST (size_qty AS INT), '}'), ',') WITHIN GROUP (ORDER BY CAST (size_numcode AS FLOAT) ASC), '}') AS size_ledger
						FROM     CTE_RECENT_MO_SIZE_RUN
						GROUP BY mo_no)
			SELECT   mf.mo_no AS mo_no,
						CAST (mf.mo_totalqty AS INT) AS order_qty,
						br.brand_name AS brand_name,
						sf.shoestyle_codefactory AS factory_shoes_style,
						CONCAT(sf.shoestyle_codecust, '/', sf.shoestyle_namecust) AS cust_shoes_style,
						prd.color_sn AS color_sn,
						mf.cofactory_code AS factory_code_produce,
						ISNULL(msl.size_ledger, '[]') AS size_ledger,
						mf.created,
						mf.updated
			FROM     wuerp_vnrd.dbo.ta_manufacturmst AS mf
						INNER JOIN
						wuerp_vnrd.dbo.ta_productmst AS prd
						ON prd.mat_code = mf.mat_code
							AND prd.isactive = 'Y'
						INNER JOIN
						wuerp_vnrd.dbo.ta_shoefactorymst AS sf
						ON sf.shoestyle_systemcodefty = prd.shoestyle_systemcodefty
							AND sf.isactive = 'Y'
						INNER JOIN
						wuerp_vnrd.dbo.ta_brand AS br
						ON br.custbrand_id = prd.custbrand_id
						INNER JOIN
						CTE_RECENT_MO_SIZE_LEDGER AS msl
						ON msl.mo_no = mf.mo_no
						INNER JOIN
						CTE_RECENT_MO AS rm
						ON rm.mo_no = mf.mo_no
			WHERE    mf.isactive = 'Y'
						AND br.brand_code IN ('UG', 'TV', 'KB')
			ORDER BY mf.created DESC;`,
			[currentCheckpoint.created, currentCheckpoint.updated]
		)

		const bulkWriteOperators: AnyBulkWriteOperation<ManufacturingOrderDocument>[] = manufacturingOrders.map(
			(item) => {
				const sizeLedger = SuperJson.parse<Record<string, { order_qty: number }>>(item.size_ledger)
				const update = { ...item, size_ledger: sizeLedger }

				return {
					updateOne: {
						filter: { mo_no: update.mo_no },
						update: {
							$set: flatten(update),
							$inc: Object.keys(sizeLedger).reduce(
								(acc, size) => ({
									...acc,
									[`size_ledger.${size}.stocked_in_qty`]: 0,
									[`size_ledger.${size}.total_recall_tx`]: 0,
									[`size_ledger.${size}.total_return_tx`]: 0,
									[`size_ledger.${size}.shipped_out_qty`]: 0
								}),
								{}
							)
						},
						upsert: true
					}
				}
			}
		)

		if (bulkWriteOperators.length === 0) {
			this.logger.warn(`No recently updated manufacturing orders, skipping upsert.`)
			return
		}

		await this.manufacturingOrderModel.bulkWrite(bulkWriteOperators)

		await this.cacheManager.set('cached:checkpoints:sync_manufacturing_order', lastCheckpoint, 60 * 1000 * 15)
	}

	@Cron(CronExpression.EVERY_5_MINUTES, { name: 'SYNC_PURCHASE_ORDER_EVERY_5_MINUTES' })
	public async handleSyncPurchaseOrder() {
		let currentCheckpoint = await this.cacheManager.get<{
			created: Date
			updated: Date
		}>('cached:checkpoints:sync_purchase_order')

		const [lastCheckpoint] = await this.dataSource.query<Array<{ created: Date; updated: Date }>>(/* SQL */ `
         SELECT MAX(ord.created) AS created,
               MAX(ord.updated) AS updated
         FROM   wuerp_vnrd.dbo.ta_ordermst AS ord
               INNER JOIN
               wuerp_vnrd.dbo.ta_brand AS br
               ON ord.custbrand_id = br.custbrand_id
                  AND br.brand_code IN ('UG', 'KB', 'TV')
      `)

		this.logger.debug(lastCheckpoint)

		if (
			isEqual(currentCheckpoint?.created, lastCheckpoint.created) &&
			isEqual(currentCheckpoint?.updated, lastCheckpoint.updated)
		) {
			this.logger.info('No purchase order to sync, last checkpoint is equal to result.')
			return
		}

		currentCheckpoint ??= lastCheckpoint

		const purchaseOrders = await this.dataSource.query<Array<PurchaseOrder>>(
			/* SQL */ `
			WITH     CTE
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
								DV_DATA_LAKE.dbo.dv_OrderProcessR05 AS orp05
								ON orp05.po = IIF (ISNULL(ord.or_custpoone, '') = '', ord.or_custpo, ord.or_custpoone)
								INNER JOIN
								wuerp_vnrd.dbo.ta_manufacturdet AS mfd
								ON mfd.or_no = ord.or_no
								INNER JOIN
								wuerp_vnrd.dbo.ta_ordersizerun AS osr
								ON osr.or_no = ord.or_no CROSS APPLY (VALUES ([size_numcode01], [size_qty01] - [size_qtycancel01]), ([size_numcode02], [size_qty02] - [size_qtycancel02]), ([size_numcode03], [size_qty03] - [size_qtycancel03]), ([size_numcode04], [size_qty04] - [size_qtycancel04]), ([size_numcode05], [size_qty05] - [size_qtycancel05]), ([size_numcode06], [size_qty06] - [size_qtycancel06]), ([size_numcode07], [size_qty07] - [size_qtycancel07]), ([size_numcode08], [size_qty08] - [size_qtycancel08]), ([size_numcode09], [size_qty09] - [size_qtycancel09]), ([size_numcode10], [size_qty10] - [size_qtycancel10]), ([size_numcode11], [size_qty11] - [size_qtycancel11]), ([size_numcode12], [size_qty12] - [size_qtycancel12]), ([size_numcode13], [size_qty13] - [size_qtycancel13]), ([size_numcode14], [size_qty14] - [size_qtycancel14]), ([size_numcode15], [size_qty15] - [size_qtycancel15]), ([size_numcode16], [size_qty16] - [size_qtycancel16]), ([size_numcode17], [size_qty17] - [size_qtycancel17]), ([size_numcode18], [size_qty18] - [size_qtycancel18]), ([size_numcode19], [size_qty19] - [size_qtycancel19]), ([size_numcode20], [size_qty20] - [size_qtycancel20]), ([size_numcode21], [size_qty21] - [size_qtycancel21]), ([size_numcode22], [size_qty22] - [size_qtycancel22]), ([size_numcode23], [size_qty23] - [size_qtycancel23]), ([size_numcode24], [size_qty24] - [size_qtycancel24]), ([size_numcode25], [size_qty25] - [size_qtycancel25]), ([size_numcode26], [size_qty26] - [size_qtycancel26]), ([size_numcode27], [size_qty27] - [size_qtycancel27]), ([size_numcode28], [size_qty28] - [size_qtycancel28]), ([size_numcode29], [size_qty29] - [size_qtycancel29]), ([size_numcode30], [size_qty30] - [size_qtycancel30]), ([size_numcode31], [size_qty31] - [size_qtycancel31]), ([size_numcode32], [size_qty32] - [size_qtycancel32]), ([size_numcode33], [size_qty33] - [size_qtycancel33]), ([size_numcode34], [size_qty34] - [size_qtycancel34]), ([size_numcode35], [size_qty35] - [size_qtycancel35]), ([size_numcode36], [size_qty36] - [size_qtycancel36]), ([size_numcode37], [size_qty37] - [size_qtycancel37]), ([size_numcode38], [size_qty38] - [size_qtycancel38]), ([size_numcode39], [size_qty39] - [size_qtycancel39]), ([size_numcode40], [size_qty40] - [size_qtycancel40])) AS sr([size_numcode], [size_qty])
						WHERE  (ord.created >= CAST (@0 AS DATETIME)
									OR ord.updated >= CAST (@1 AS DATETIME))
								AND sr.size_qty > 0
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
									SUM(size_qty) AS total_qty
						FROM     CTE
						GROUP BY po, size_numcode),
						CTE_PROGRESS
			AS       (SELECT   po,
									CONCAT('{', STRING_AGG(CAST (CONCAT('"', size_numcode, '":{"order_qty":', total_qty, '}') AS NVARCHAR (MAX)), ',') WITHIN GROUP (ORDER BY CAST (size_numcode AS FLOAT) ASC), '}') AS shipping_progress
						FROM     CTE_SIZE_LEDGER
						GROUP BY po)
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
			`,
			[currentCheckpoint.created, currentCheckpoint.updated]
		)

		const bulkWriteOperators = purchaseOrders.map<AnyBulkWriteOperation<PurchaseOrderDocument>>((item) => {
			item.shipping_progress = SuperJson.isValid(item.shipping_progress)
				? SuperJson.parse<PurchaseOrder['shipping_progress']>(item.shipping_progress)
				: {}

			item.packing = SuperJson.isValid(item.packing) ? SuperJson.parse<PurchaseOrder['packing']>(item.packing) : {}

			return {
				updateOne: {
					filter: { po: item.po },
					update: {
						$setOnInsert: {
							po: item.po,
							order_qty: item.order_qty,
							brand_name: item.brand_name,
							factory_shoes_style: item.factory_shoes_style,
							cust_shoes_style: item.cust_shoes_style,
							color_sn: item.color_sn,
							shipping_method: item.shipping_method,
							shipping_destination: item.shipping_destination
						},
						$set: {
							...flatten(pick(item, 'shipping_progress')),
							...flatten(pick(item, 'packing'))
						},
						$inc: Object.keys(item.shipping_progress).reduce(
							(acc, size) => ({ ...acc, [`shipping_progress.${size}.shipped_out_qty`]: 0 }),
							{}
						)
					},
					upsert: true
				}
			}
		})

		if (bulkWriteOperators.length === 0) {
			this.logger.warn(`No recently updated purchase orders, skipping upsert.`)
			return
		}

		await this.purchaseOrderModel.bulkWrite(bulkWriteOperators, { ordered: false })

		await this.cacheManager.set('cached:checkpoints:sync_purchase_order', lastCheckpoint, 60 * 1000 * 15)
	}
}
