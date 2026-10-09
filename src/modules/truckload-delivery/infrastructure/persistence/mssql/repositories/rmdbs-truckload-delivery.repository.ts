import { CdcEchoRegistryService } from '@databases/cdc/services/cdc-echo-registery.service'
import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ISignatureStorage, SIGNATURE_STORAGE } from '../../../../application/ports/signature-storage.port'
import { IRmdbsTruckloadDeliveryRepository } from '../../../../application/ports/truckload-delivery.rmdbs.repository.port'
import { DISPATCH_ORDER_SIGNATURE_FIELDS } from '../../../../domain/constants'
import { DispatchOrderProps } from '../../../../domain/models/dispatch-order.model'
import { TruckloadDeliveryEntity } from '../entities/truckload-delivery.entity'

const getPackingIdFromSyncId = (dispatchOrder: string, syncId: string | null): string | undefined => {
	const prefix = `${dispatchOrder}:`
	if (!syncId?.startsWith(prefix)) return undefined

	return /^\d+:([a-f\d]{24})$/i.exec(syncId.slice(prefix.length))?.[1]
}

@Injectable()
export class RmdbsTruckloadDeliveryRepository implements IRmdbsTruckloadDeliveryRepository {
	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly repository: Repository<TruckloadDeliveryEntity>,
		private readonly cdcEchoRegistry: CdcEchoRegistryService,
		@Inject(SIGNATURE_STORAGE) private readonly signatureStorage: ISignatureStorage
	) {}

	/** MSSQL keeps the original base64 data URL, MongoDB only holds the GridFS id. */
	private async toBase64(signatureId: string | null): Promise<string | null> {
		if (!signatureId) return null
		const signature = await this.signatureStorage.download(signatureId)
		return signature ? `data:${signature.contentType};base64,${signature.buffer.toString('base64')}` : null
	}

	async reconcileDispatchOrder(dispatchOrder: string, snapshot: DispatchOrderProps | null): Promise<void> {
		const existing = await this.repository.find({ where: { dispatch_order: dispatchOrder } })
		const desired = snapshot?.packing ?? []

		if (!snapshot || desired.length === 0) {
			// for (const row of existing) {
			// 	await this.cdcEchoRegistry.registerOrigin(
			// 		DATA_SOURCE_DATA_LAKE,
			// 		'dbo',
			// 		TRUCKLOAD_DELIVERY_TABLE,
			// 		getDeletedRowEchoKey(dispatchOrder, row.po)
			// 	)
			// }
			if (existing.length > 0) await this.repository.delete({ dispatch_order: dispatchOrder })
			return
		}

		const [ie_signature, warehouse_officer_signature, security_1_signature, security_2_signature] = await Promise.all(
			DISPATCH_ORDER_SIGNATURE_FIELDS.map((field) => this.toBase64(snapshot[field]))
		)

		const common = {
			dispatch_order: dispatchOrder,
			factory_code: snapshot.factory_code,
			license_plate: snapshot.license_plate,
			container_number: snapshot.container_number,
			seal_number: snapshot.seal_number,
			factory_entrance_time: snapshot.factory_entrance_time,
			punctured_container: snapshot.punctured_container,
			smelling_container: snapshot.smelling_container,
			moist_container: snapshot.moist_container,
			approval_status: snapshot.approval_status,
			container_sealing_time: snapshot.container_sealing_time,
			factory_departure_time: snapshot.factory_departure_time,
			actual_factory_departure_time: snapshot.license_plate_capture_time,
			ie_signature,
			warehouse_officer_signature,
			security_1_signature,
			security_2_signature,
			remark: snapshot.remark,
			...(snapshot.user_code_updated ? { user_code_updated: snapshot.user_code_updated } : {})
		}

		await this.repository.manager.transaction(async (manager) => {
			const existingByPackingId = new Map<string, TruckloadDeliveryEntity>()
			for (const row of existing) {
				const packingId = getPackingIdFromSyncId(dispatchOrder, row.sync_id)
				if (packingId) existingByPackingId.set(packingId, row)
			}
			const existingByPo = new Map(existing.map((row) => [row.po, row]))
			const matchedRows = new Set<number>()
			const reconciliations = desired.map((line) => {
				const existingRow =
					(line.packing_id && existingByPackingId.get(line.packing_id)) ?? existingByPo.get(line.po)
				if (existingRow) matchedRows.add(existingRow.id)
				return { line, existingRow }
			})
			const obsolete = existing.filter((row) => !matchedRows.has(row.id))
			// for (const row of obsolete) {
			// 	await this.cdcEchoRegistry.registerOrigin(
			// 		DATA_SOURCE_DATA_LAKE,
			// 		'dbo',
			// 		TRUCKLOAD_DELIVERY_TABLE,
			// 		getDeletedRowEchoKey(dispatchOrder, row.po)
			// 	)
			// }
			if (obsolete.length > 0) {
				await manager.delete(
					TruckloadDeliveryEntity,
					{ id: In(obsolete.map((row) => row.id)) }
					// { is_active: false }
				)
			}
			for (const { line, existingRow } of reconciliations) {
				const values = {
					...common,
					sync_id: line.packing_id
						? `${snapshot.dispatch_order}:${snapshot.revision}:${line.packing_id}`
						: `${snapshot.dispatch_order}:${snapshot.revision}`,
					po: line.po,
					outbound_qty: line.outbound_qty,
					user_code_created: line.user_code_created
				}
				if (existingRow) await manager.update(TruckloadDeliveryEntity, { id: existingRow.id }, values)
				else await manager.upsert(TruckloadDeliveryEntity, [values], ['dispatch_order', 'po'])
			}
		})
	}
}
