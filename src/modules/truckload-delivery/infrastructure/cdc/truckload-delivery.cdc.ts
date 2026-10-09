import { CdcHandler } from '@databases/cdc/decorators'
import { CdcEchoRegistryService } from '@databases/cdc/services/cdc-echo-registery.service'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA, RecordStatus } from '@databases/constants'
import { InjectModel } from '@nestjs/mongoose'
import { isUndefined, omitBy, uniq } from 'lodash'
import { Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { TruckloadDelivery, TruckloadDeliveryModel } from '../persistence/mongodb/schemas/truckload-delivery.schema'

export const TRUCKLOAD_DELIVERY_TABLE = 'dv_truckload_delivery'

/** Echo marker registered by the MSSQL repository before it deletes a row on behalf of MongoDB. */
export const getDeletedRowEchoKey = (dispatchOrder: string, po: string) => `delete:${dispatchOrder}:${po}`

type TruckloadDeliveryCdcRow = {
	sync_id?: string | null
	isactive?: string
	dispatch_order: string
	po: string
	outbound_qty: number
	factory_code?: string
	license_plate?: string | null
	container_number?: string | null
	seal_number?: string | null
	approval_status?: string
	factory_entrance_time?: Date | null
	container_sealing_time?: Date | null
	factory_departure_time?: Date | null
	actual_factory_departure_time?: Date | null
	punctured_container?: boolean
	smelling_container?: boolean
	moist_container?: boolean
	ie_signature?: string | null
	warehouse_officer_signature?: string | null
	security_1_signature?: string | null
	security_2_signature?: string | null
	remark?: string | null
}

const normalizeCode = (value: string | null | undefined) =>
	value === undefined ? undefined : value?.trim().toUpperCase() || null

const getPackingId = (dispatchOrder: string, syncId: string | null | undefined): string | undefined => {
	const prefix = `${dispatchOrder}:`
	if (!syncId?.startsWith(prefix)) return undefined

	return /^\d+:([a-f\d]{24})$/i.exec(syncId.slice(prefix.length))?.[1]
}

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: TRUCKLOAD_DELIVERY_TABLE,
	pollIntervalMs: 1000,
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	originMarkerColumn: 'sync_id'
})
export class TruckloadDeliveryCdcHandler implements ICdcHandler<TruckloadDeliveryCdcRow> {
	constructor(
		@InjectModel(TruckloadDelivery.name, DATA_WAREHOUSE_CONNECTION) private readonly model: TruckloadDeliveryModel,
		private readonly echoRegistry: CdcEchoRegistryService,
		@InjectPinoLogger(TruckloadDeliveryCdcHandler.name) private readonly logger: PinoLogger
	) {}

	async handle({ changes }: CdcChangeContext<TruckloadDeliveryCdcRow>): Promise<void> {
		const touched: string[] = []

		for (const change of changes) {
			for (const row of change.data) {
				if (!row.dispatch_order || !row.po) continue

				const packingId = getPackingId(row.dispatch_order, row.sync_id)
				const isRemoval = change.operation === 'delete' || row.isactive === RecordStatus.INACTIVE
				const echoKey =
					change.operation === 'delete' ? getDeletedRowEchoKey(row.dispatch_order, row.po) : row.sync_id
				// * The CDC watcher only recognises echoes of updates, so inserts and deletes are filtered here
				const isEcho =
					!!echoKey &&
					(await this.echoRegistry.consumeIfOrigin(
						DATA_SOURCE_DATA_LAKE,
						DATABASE_SCHEMA,
						TRUCKLOAD_DELIVERY_TABLE,
						echoKey
					))
				if (isEcho) continue

				if (isRemoval) await this.removePurchaseOrder(row, packingId)
				else await this.upsertPurchaseOrder(row, packingId)
				touched.push(row.dispatch_order)
			}
		}

		await this.refreshAggregates(uniq(touched))
		this.logger.debug(`Processed ${touched.length} truckload delivery CDC rows`)
	}

	private async upsertPurchaseOrder(row: TruckloadDeliveryCdcRow, packingId?: string): Promise<void> {
		const header = omitBy(
			{
				factory_code: row.factory_code,
				license_plate: normalizeCode(row.license_plate),
				container_number: normalizeCode(row.container_number),
				seal_number: normalizeCode(row.seal_number),
				approval_status: row.approval_status,
				factory_entrance_time: row.factory_entrance_time,
				container_sealing_time: row.container_sealing_time,
				factory_departure_time: row.factory_departure_time,
				// * MSSQL cannot clear a capture, and the image only exists in MongoDB
				license_plate_capture_time: row.actual_factory_departure_time ?? undefined,
				punctured_container: row.punctured_container,
				smelling_container: row.smelling_container,
				moist_container: row.moist_container,
				remark: row.remark
			},
			isUndefined
		)

		await this.model.updateOne(
			{ dispatch_order: row.dispatch_order },
			{ $set: header, $inc: { revision: 1 } },
			{ upsert: true }
		)

		// * Only the quantity is owned by MSSQL, PO attributes and actors stay as MongoDB wrote them
		const updatedByPackingId = packingId
			? await this.model.updateOne(
					{ dispatch_order: row.dispatch_order, 'packing._id': new Types.ObjectId(packingId) },
					{
						$set: {
							'packing.$.po': row.po,
							'packing.$.outbound_qty': row.outbound_qty
						}
					}
				)
			: { matchedCount: 0 }
		if (updatedByPackingId.matchedCount > 0) return

		const updatedByPo = await this.model.updateOne(
			{ dispatch_order: row.dispatch_order, 'packing.po': row.po },
			{
				$set: {
					'packing.$.outbound_qty': row.outbound_qty
				}
			}
		)
		if (updatedByPo.matchedCount > 0) return

		await this.model.updateOne(
			{ dispatch_order: row.dispatch_order, 'packing.po': { $ne: row.po } },
			{
				$push: {
					packing: {
						...(packingId ? { _id: new Types.ObjectId(packingId) } : {}),
						po: row.po,
						outbound_qty: row.outbound_qty,
						order_qty: 0,
						brand_name: null,
						factory_shoes_style: null,
						color_sn: null,
						created_by: null,
						updated_by: null,
						created_at: new Date()
					}
				}
			}
		)
	}

	private async removePurchaseOrder(row: TruckloadDeliveryCdcRow, packingId?: string): Promise<void> {
		await this.model.updateOne(
			{ dispatch_order: row.dispatch_order },
			{
				$pull: {
					packing: packingId ? { _id: new Types.ObjectId(packingId) } : { po: row.po }
				},
				$inc: { revision: 1 }
			}
		)
	}

	private async refreshAggregates(dispatchOrders: string[]): Promise<void> {
		if (dispatchOrders.length === 0) return

		// * A dispatch order without purchase orders no longer exists
		await this.model.deleteMany({ dispatch_order: { $in: dispatchOrders }, packing: { $size: 0 } })
		await this.model.collection.updateMany({ dispatch_order: { $in: dispatchOrders } }, [
			{ $set: { total_outbound_qty: { $sum: '$packing.outbound_qty' } } }
		])
	}
}
