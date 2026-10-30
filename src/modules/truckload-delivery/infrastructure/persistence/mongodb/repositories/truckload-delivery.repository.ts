import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { UserDocument } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { subMinutes } from 'date-fns'
import { escapeRegExp } from 'lodash'
import { LeanDocument, mongo, Schema, Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UnflatedFilterQueryDTO } from '../../../../application/dto/truckload-delivery.dto'
import { DispatchOrderView } from '../../../../application/interfaces'
import { ITruckloadDeliveryRepository } from '../../../../application/ports/truckload-delivery.repository.port'
import { LICENSE_PLATE_CAPTURE_WINDOW, SIGNATURE_ENDPOINT, TruckloadDeliveryStatus } from '../../../../domain/constants'
import {
	ConcurrentDispatchOrderModificationException,
	DispatchOrderAlreadyExistsException,
	DispatchOrderNotFoundException
} from '../../../../domain/exceptions'
import { DispatchOrderModel, DispatchOrderProps } from '../../../../domain/models/dispatch-order.model'
import { buildDispatchOrderFilter, buildDispatchOrderSort } from '../builders/dispatch-order-query.builder'
import {
	TruckloadDelivery,
	TruckloadDeliveryDocument,
	TruckloadDeliveryModel
} from '../schemas/truckload-delivery.schema'

const DUPLICATE_KEY_ERROR_CODE = 11000

@Injectable()
export class TruckloadDeliveryRepository implements ITruckloadDeliveryRepository {
	constructor(
		@InjectModel(TruckloadDelivery.name, DATA_WAREHOUSE_CONNECTION)
		private readonly truckloadDeliveryModel: TruckloadDeliveryModel,
		@InjectPinoLogger(TruckloadDeliveryRepository.name)
		private readonly logger: PinoLogger
	) {}

	// #region Write side (primary)

	async findByDispatchOrder(dispatchOrder: string): Promise<DispatchOrderModel | null> {
		// * Write-side reconstruction: keep created_by/updated_by as raw ObjectIds so the domain model can be re-saved
		const raw = await this.truckloadDeliveryModel
			.findOne({ dispatch_order: dispatchOrder })
			.read('primary' satisfies mongo.ReadPreferenceMode)
			.lean<LeanDocument<TruckloadDeliveryDocument>>(true)

		return raw ? DispatchOrderModel.fromPersistence(this.toProps(raw)) : null
	}

	async getByDispatchOrder(dispatchOrder: string): Promise<DispatchOrderModel> {
		const model = await this.findByDispatchOrder(dispatchOrder)
		if (!model) throw new DispatchOrderNotFoundException(dispatchOrder)
		return model
	}

	async findDispatchOrderCodesByPrefix(prefix: string): Promise<string[]> {
		const docs = await this.truckloadDeliveryModel
			.find({ dispatch_order: new RegExp(`^${escapeRegExp(prefix)}`) }, { dispatch_order: 1 })
			.read('primary' satisfies mongo.ReadPreferenceMode)
			.lean()
		return docs.map((row) => row.dispatch_order)
	}

	async findLicensePlateCaptureCandidates(licensePlate: string, snapTime: Date): Promise<DispatchOrderModel[]> {
		const docs = await this.truckloadDeliveryModel
			.find({
				license_plate: licensePlate,
				container_sealing_time: { $lte: subMinutes(snapTime, LICENSE_PLATE_CAPTURE_WINDOW.AFTER_SEALING_MINUTES) },
				factory_departure_time: {
					$gte: subMinutes(snapTime, LICENSE_PLATE_CAPTURE_WINDOW.AFTER_DEPARTURE_MINUTES)
				},
				$or: [{ license_plate_capture_time: null }, { license_plate_capture_time: { $lt: snapTime } }]
			})
			.read('primary' satisfies mongo.ReadPreferenceMode)
			.lean<LeanDocument<TruckloadDeliveryDocument>[]>()
		return docs.map((row) => DispatchOrderModel.fromPersistence(this.toProps(row)))
	}

	async findMissingLicensePlateImage(): Promise<DispatchOrderModel[]> {
		const docs = await this.truckloadDeliveryModel
			.find({
				license_plate: { $ne: null },
				warehouse_officer_signature: { $ne: null },
				security_1_signature: { $ne: null },
				security_2_signature: { $ne: null },
				$or: [{ license_plate_image: null }, { license_plate_capture_time: null }]
			})
			.read('secondary' satisfies mongo.ReadPreferenceMode)
			.lean<LeanDocument<TruckloadDeliveryDocument>[]>()
		return docs.map((row) => DispatchOrderModel.fromPersistence(this.toProps(row)))
	}

	async insert(model: DispatchOrderModel): Promise<void> {
		const { revision, created_at, ...props } = model.toProps()
		const document = {
			...props,
			packing: props.packing.map((line) => ({
				...line,
				created_by: props.created_by,
				updated_by: props.updated_by
			}))
		}

		try {
			const newDispatchOrder = await this.truckloadDeliveryModel.create({ ...document, revision: 0 })
			await newDispatchOrder.save()
		} catch (error) {
			if ((error as { code?: number })?.code === DUPLICATE_KEY_ERROR_CODE)
				throw new DispatchOrderAlreadyExistsException(props.dispatch_order)
			throw error
		}
	}

	async save(model: DispatchOrderModel): Promise<void> {
		const { dispatch_order, revision, created_at, ...props } = model.toProps()
		const update = {
			...props,
			created_by: props.user_code_created,
			updated_by: props.user_code_updated,
			packing: props.packing.map(({ packing_id, ...line }) => ({
				...line,
				_id: packing_id ? new Types.ObjectId(packing_id) : new Types.ObjectId(),
				created_by: line.created_by,
				updated_by: line.updated_by
			}))
		}
		const result = await this.truckloadDeliveryModel.updateOne(
			{ dispatch_order, revision: revision === 0 ? { $in: [0, null] } : revision } as any,
			{ $set: update, $inc: { revision: 1 } }
		)
		if (result.matchedCount === 0) throw new ConcurrentDispatchOrderModificationException(dispatch_order)
	}

	async deleteByDispatchOrder(dispatchOrder: string): Promise<void> {
		await this.truckloadDeliveryModel.deleteMany({ dispatch_order: dispatchOrder })
	}

	// #endregion

	// #region Read side (secondary)

	async paginate(query: UnflatedFilterQueryDTO) {
		const { page, limit } = query

		const paginateResult = await this.truckloadDeliveryModel.paginate(buildDispatchOrderFilter(query.where), {
			page,
			limit,
			sort: buildDispatchOrderSort(query.sort),
			// * paginate-v2 ignores `lean` objects when `leanWithVirtuals` is set, which would skip autopopulate
			leanWithVirtuals: true,
			options: {
				lean: { autopopulate: true },
				readPreference: 'secondaryPreferred' satisfies mongo.ReadPreferenceMode
			}
		})

		const dispatchedOrders = paginateResult.docs

		const sumDispatchedQty = await this.sumDispatchedQtyByPo([
			...new Set(dispatchedOrders.flatMap((order) => order.packing.map((line) => line.po)))
		])

		return {
			data: paginateResult.docs.map((doc) => {
				return {
					dispatch_order: doc.dispatch_order,
					factory_code: doc.factory_code,
					total_outbound_qty: doc.total_outbound_qty,
					license_plate: doc.license_plate ?? null,
					container_number: doc.container_number ?? null,
					seal_number: doc.seal_number ?? null,
					punctured_container: !!doc.punctured_container,
					smelling_container: !!doc.smelling_container,
					moist_container: !!doc.moist_container,
					approval_status: doc.approval_status ?? TruckloadDeliveryStatus.PENDING,
					factory_entrance_time: doc.factory_entrance_time ?? null,
					container_sealing_time: doc.container_sealing_time ?? null,
					factory_departure_time: doc.factory_departure_time ?? null,
					license_plate_capture_time: doc.license_plate_capture_time ?? null,
					license_plate_image: doc.license_plate_image ?? null,
					ie_signature: this.toSignatureUrl(doc.ie_signature),
					warehouse_officer_signature: this.toSignatureUrl(doc.warehouse_officer_signature),
					security_1_signature: this.toSignatureUrl(doc.security_1_signature),
					security_2_signature: this.toSignatureUrl(doc.security_2_signature),
					remark: doc.remark,
					created_by: doc.created_by,
					updated_by: doc.updated_by,
					created_at: doc.created_at,
					updated_at: doc.updated_at,
					revision: doc.revision,
					packing: doc.packing.map((pk) => ({
						po: pk.po,
						outbound_qty: pk.outbound_qty,
						order_qty: pk.po_info?.order_qty ?? 0,
						brand_name: pk.po_info?.brand_name,
						factory_shoes_style: pk.po_info?.factory_shoes_style,
						color_sn: pk.po_info?.color_sn,
						// cust_shoes_style: pk.po_info?.cust_shoes_style ?? null,
						// shipping_destination: pk.po_info?.shipping_destination ?? null,
						dispatched_outbound_qty: sumDispatchedQty.get(pk.po) ?? 0,
						created_by: pk.created_by,
						updated_by: pk.created_by,
						created_at: pk.created_at,
						updated_at: pk.updated_at
					}))
				}
			}),
			page: paginateResult.page,
			limit: paginateResult.limit,
			hasNextPage: paginateResult.hasNextPage,
			hasPrevPage: paginateResult.hasPrevPage,
			nextPage: paginateResult.nextPage,
			prevPage: paginateResult.prevPage,
			totalDocs: paginateResult.totalDocs,
			totalPages: paginateResult.totalPages
		} satisfies Pagination<DispatchOrderView>
	}

	async findAll(query: Omit<UnflatedFilterQueryDTO, 'page' | 'limit'> = {}): Promise<DispatchOrderView[]> {
		const docs = await this.truckloadDeliveryModel
			.find(buildDispatchOrderFilter(query.where))
			.sort(buildDispatchOrderSort(query.sort))
			.read('secondary' satisfies mongo.ReadPreferenceMode)
			.lean<LeanDocument<TruckloadDeliveryDocument>[]>({ autopopulate: true, virtuals: true })

		return docs.map((doc) => {
			const props = this.toProps(doc)
			return {
				...props,
				packing: props.packing.map((line) => {
					const viewLine = { ...line }
					delete viewLine.packing_id
					return viewLine
				})
			}
		})
	}

	async sumDispatchedQtyByPo(pos: string[]): Promise<Map<string, number>> {
		if (pos.length === 0) return new Map()

		const rows = await this.truckloadDeliveryModel
			.aggregate<{ _id: string; dispatched_outbound_qty: number }>([
				{ $match: { 'packing.po': { $in: pos } } },
				{ $unwind: '$packing' },
				{ $match: { 'packing.po': { $in: pos } } },
				{ $group: { _id: '$packing.po', dispatched_outbound_qty: { $sum: '$packing.outbound_qty' } } }
			])
			.read('secondaryPreferred')

		return new Map(rows.map((row) => [row._id, row.dispatched_outbound_qty]))
	}

	// #endregion

	private toProps(doc: TruckloadDeliveryDocument): DispatchOrderView {
		const packing = (doc.packing ?? []).map((pk): ArrayElement<DispatchOrderView['packing']> => ({
			packing_id: pk._id?.toString(),
			po: pk.po,
			outbound_qty: pk.outbound_qty,
			order_qty: pk.po_info?.order_qty ?? 0,
			brand_name: pk.po_info?.brand_name ?? null,
			factory_shoes_style: pk.po_info?.factory_shoes_style ?? null,
			cust_shoes_style: pk.po_info?.cust_shoes_style ?? null,
			color_sn: pk.po_info?.color_sn ?? null,
			shipping_destination: pk.po_info?.shipping_destination ?? null,
			created_by: this.toUserId(pk.created_by),
			updated_by: this.toUserId(pk.updated_by),
			user_code_created: this.toUserInfo(pk.created_by, 'code'),
			user_name_created: this.toUserInfo(pk.created_by, 'name'),
			user_code_updated: this.toUserInfo(pk.updated_by, 'code'),
			user_name_updated: this.toUserInfo(pk.updated_by, 'name'),
			created_at: pk.created_at ?? null,
			updated_at: pk.updated_at ?? null
		}))

		return {
			dispatch_order: doc.dispatch_order,
			factory_code: doc.factory_code,
			packing,
			total_outbound_qty:
				doc.total_outbound_qty ??
				packing.reduce((sum: number, line: { outbound_qty: number }) => sum + line.outbound_qty, 0),
			license_plate: doc.license_plate ?? null,
			container_number: doc.container_number ?? null,
			seal_number: doc.seal_number ?? null,
			punctured_container: !!doc.punctured_container,
			smelling_container: !!doc.smelling_container,
			moist_container: !!doc.moist_container,
			approval_status: doc.approval_status ?? TruckloadDeliveryStatus.PENDING,
			factory_entrance_time: doc.factory_entrance_time ?? null,
			container_sealing_time: doc.container_sealing_time ?? null,
			factory_departure_time: doc.factory_departure_time ?? null,
			license_plate_capture_time: doc.license_plate_capture_time ?? null,
			license_plate_image: doc.license_plate_image ?? null,
			ie_signature: doc.ie_signature?.toString() ?? null,
			warehouse_officer_signature: doc.warehouse_officer_signature?.toString() ?? null,
			security_1_signature: doc.security_1_signature?.toString() ?? null,
			security_2_signature: doc.security_2_signature?.toString() ?? null,
			remark: doc.remark ?? null,
			created_by: this.toUserId(doc.created_by),
			updated_by: this.toUserId(doc.updated_by),
			created_at: doc.created_at ?? null,
			updated_at: doc.created_at ?? null,
			revision: doc.revision ?? 0
		}
	}

	private toSignatureUrl(id: { toString(): string } | null | undefined): string | null {
		this.logger.debug(id)
		return id ? `${SIGNATURE_ENDPOINT}/${id.toString()}` : null
	}

	private toUserId(reference: Pick<UserDocument, '_id'> | undefined): DispatchOrderProps['created_by'] {
		if (reference == null) return null
		const identifier = typeof reference === 'object' && '_id' in reference ? reference._id : reference
		return (
			typeof identifier === 'string' ? new Schema.Types.ObjectId(identifier) : identifier
		) as DispatchOrderProps['created_by']
	}

	private toUserInfo(reference: Pick<UserDocument, '_id'> | undefined, property: 'code' | 'name') {
		const populated =
			reference && typeof reference === 'object' && 'username' in reference
				? (reference as { username?: string; display_name?: string })
				: null

		const result: Map<'code' | 'name', string | null> = new Map<'code' | 'name', string | null>([
			['code', populated?.username ?? null],
			['name', populated?.display_name ?? null]
		])
		return result.get(property)
	}
}
