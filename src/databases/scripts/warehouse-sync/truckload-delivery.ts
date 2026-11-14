import { Types, mongo } from 'mongoose'
import {
	DISPATCH_ORDER_SIGNATURE_FIELDS,
	SIGNATURE_BUCKET_NAME
} from '../../../modules/truckload-delivery/domain/constants'
import { decodeTruckloadSignature, uploadTruckloadSignature } from '../libs/truckload-signatures'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const TRUCKLOAD_DELIVERIES_SQL = /* SQL */ `
	SELECT   a.dispatch_order,
				MIN(a.created) AS created_at,
				a.factory_code,
				a.approval_status,
				a.license_plate,
				IIF (a.container_number = '', NULL, a.container_number) AS container_number,
				a.punctured_container,
				a.smelling_container,
				a.moist_container,
				c.packing,
				a.factory_entrance_time,
				a.container_sealing_time,
				a.factory_departure_time,
				b.snap_time AS license_plate_capture_time,
				b.images AS license_plate_image,
				MAX(a.ie_signature) AS ie_signature,
				MAX(a.warehouse_officer_signature) AS warehouse_officer_signature,
				MAX(a.security_1_signature) AS security_1_signature,
				MAX(a.security_2_signature) AS security_2_signature,
				@createdBy AS created_by
	FROM     DV_DATA_LAKE.dbo.dv_truckload_delivery AS a
				OUTER APPLY (
					SELECT TOP (1) plate.snap_time, plate.images
					FROM DV_DATA_LAKE.dbo.dv_carlicenseplates AS plate
					WHERE EXISTS (
						SELECT 1
						FROM DV_DATA_LAKE.dbo.dv_truckload_delivery AS snapshot_delivery
						WHERE snapshot_delivery.dispatch_order = a.dispatch_order
							AND snapshot_delivery.isactive = 'Y'
							AND TRIM(UPPER(snapshot_delivery.license_plate)) = TRIM(UPPER(plate.plate_name))
							AND plate.snap_time BETWEEN DATEADD(MINUTE, 1, snapshot_delivery.container_sealing_time)
								AND DATEADD(MINUTE, 30, snapshot_delivery.factory_departure_time)
					)
					ORDER BY plate.snap_time DESC, plate.plate_name ASC, plate.images ASC
				) AS b
				CROSS APPLY (SELECT dd.po,
									dd.outbound_qty,
									a.created AS created_at,
									a.updated AS updated_at,
									@createdBy AS created_by
							FROM   DV_DATA_LAKE.dbo.dv_truckload_delivery AS dd
							WHERE  dd.dispatch_order = a.dispatch_order
									AND dd.isactive = 'Y'
							FOR JSON PATH) AS c(packing)
	WHERE    a.isactive = 'Y'
	GROUP BY a.dispatch_order, a.factory_code, a.license_plate, b.snap_time, b.images, a.container_number, a.factory_entrance_time, a.container_sealing_time, a.factory_departure_time, a.approval_status, a.punctured_container, a.smelling_container, a.moist_container, c.packing
	ORDER BY a.dispatch_order;
`

const BATCH_SIZE = 100

function objectId(value: unknown, field: string): Types.ObjectId {
	if (typeof value !== 'string') throw new Error(`Invalid truckload delivery ${field}`)
	try {
		return new Types.ObjectId(value)
	} catch {
		throw new Error(`Invalid truckload delivery ${field}`)
	}
}

function requiredDate(value: unknown, field: string): Date {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		throw new Error(`Invalid truckload delivery ${field}`)
	}
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid truckload delivery ${field}`)
	return date
}

function mapPacking(value: unknown, dispatchOrder: string): Record<string, unknown>[] {
	if (typeof value !== 'string') throw new Error(`Invalid packing for ${dispatchOrder}`)
	let parsed: unknown
	try {
		parsed = JSON.parse(value)
	} catch {
		throw new Error(`Invalid packing for ${dispatchOrder}`)
	}
	if (!Array.isArray(parsed)) throw new Error(`Invalid packing for ${dispatchOrder}`)
	return parsed.map((entry) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Invalid packing entry for ${dispatchOrder}`)
		}
		const item = entry as Record<string, unknown>
		if (
			typeof item.po !== 'string' ||
			!item.po.trim() ||
			typeof item.outbound_qty !== 'number' ||
			!Number.isFinite(item.outbound_qty)
		) {
			throw new Error(`Invalid packing entry for ${dispatchOrder}`)
		}
		return {
			...item,
			created_at: requiredDate(item.created_at, 'packing created_at'),
			created_by: objectId(item.created_by, 'packing created_by'),
			updated_at: requiredDate(item.updated_at, 'packing updated_at')
		}
	})
}

function mapDelivery(value: unknown) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid truckload delivery row')
	}
	const row = value as Record<string, unknown>
	if (
		typeof row.dispatch_order !== 'string' ||
		!row.dispatch_order.trim() ||
		!('packing' in row) ||
		!('created_by' in row)
	) {
		throw new Error('Invalid truckload delivery row')
	}
	const packing = mapPacking(row.packing, row.dispatch_order)
	return {
		dispatchOrder: row.dispatch_order,
		delivery: {
			...row,
			total_outbound_qty: packing.reduce((sum, item) => sum + (item.outbound_qty as number), 0),
			packing,
			created_by: objectId(row.created_by, 'created_by')
		}
	}
}

function preferredDelivery(candidate: Record<string, unknown>, current: Record<string, unknown>): boolean {
	const captureTime = (value: unknown) => {
		if (value instanceof Date) return value.getTime()
		if (typeof value === 'string') {
			const parsed = Date.parse(value)
			return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
		}
		return Number.NEGATIVE_INFINITY
	}
	const candidateTime = captureTime(candidate.license_plate_capture_time)
	const currentTime = captureTime(current.license_plate_capture_time)
	if (candidateTime !== currentTime) return candidateTime > currentTime

	const candidateImage = typeof candidate.license_plate_image === 'string' ? candidate.license_plate_image : ''
	const currentImage = typeof current.license_plate_image === 'string' ? current.license_plate_image : ''
	if (candidateImage !== currentImage) return candidateImage < currentImage

	const stableValue = (value: Record<string, unknown>) =>
		JSON.stringify(
			Object.fromEntries(Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
		)
	return stableValue(candidate) < stableValue(current)
}

export async function runTruckloadDeliveryStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	createdByUsername = '1009006'
): Promise<{ deliveries: number }> {
	if (!createdByUsername.trim()) throw new Error('Truckload delivery creator username is required')
	const creator = await database.collection('users').findOne({ username: createdByUsername })
	if (!creator) throw new Error(`Truckload delivery creator ${createdByUsername} was not found`)
	const createdById = objectId(String(creator._id), 'creator')
	const collection = database.collection('truckload_delivery')
	let bucket: mongo.GridFSBucket | undefined
	let operations: mongo.AnyBulkWriteOperation[] = []
	let deliveries = 0
	let pendingDelivery: ReturnType<typeof mapDelivery> | undefined

	const writePendingDelivery = async (item: ReturnType<typeof mapDelivery>) => {
		for (const field of DISPATCH_ORDER_SIGNATURE_FIELDS) {
			const value = item.delivery[field]
			if (value === undefined || value === null) continue
			if (typeof value !== 'string') throw new Error(`Invalid truckload delivery ${field} for ${item.dispatchOrder}`)
			const signature = decodeTruckloadSignature(value, `${item.dispatchOrder}.${field}`)
			if (!signature) {
				item.delivery[field] = null
				continue
			}
			bucket ??= new mongo.GridFSBucket(database, { bucketName: SIGNATURE_BUCKET_NAME })
			item.delivery[field] = await uploadTruckloadSignature(bucket, `${item.dispatchOrder}.${field}`, signature)
		}
		operations.push({
			updateOne: {
				filter: { dispatch_order: item.dispatchOrder },
				update: { $set: item.delivery },
				upsert: true
			}
		})
		if (operations.length >= BATCH_SIZE) {
			const result = await collection.bulkWrite(operations, { ordered: false })
			if (!result.isOk()) throw new Error('Failed truckload delivery batch')
			deliveries += operations.length
			operations = []
		}
	}

	for await (const sourceRow of streamMssqlRows(pool.request(), TRUCKLOAD_DELIVERIES_SQL, {
		createdBy: createdById.toString()
	})) {
		const item = mapDelivery(sourceRow)
		if (pendingDelivery?.dispatchOrder === item.dispatchOrder) {
			if (preferredDelivery(item.delivery, pendingDelivery.delivery)) pendingDelivery = item
			continue
		}
		if (pendingDelivery) await writePendingDelivery(pendingDelivery)
		pendingDelivery = item
	}

	if (pendingDelivery) await writePendingDelivery(pendingDelivery)
	if (operations.length) {
		const result = await collection.bulkWrite(operations, { ordered: false })
		if (!result.isOk()) throw new Error('Failed truckload delivery batch')
		deliveries += operations.length
	}
	return { deliveries }
}
