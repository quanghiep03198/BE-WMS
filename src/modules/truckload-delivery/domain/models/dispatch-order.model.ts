import { TRequestUser } from '@common/decorators'
import { IUser } from '@modules/user/domain/interfaces'
import { AggregateRoot } from '@nestjs/cqrs'
import { addMinutes, isAfter, isBefore } from 'date-fns'
import { isUndefined, omitBy } from 'lodash'
import { DispatchOrderSignatureField, LICENSE_PLATE_CAPTURE_WINDOW, TruckloadDeliveryStatus } from '../constants'
import {
	ContainerConditionUpdatedEvent,
	DispatchOrderCreatedEvent,
	DispatchOrderDeletedEvent,
	DispatchOrderInfoUpdatedEvent,
	DispatchOrderSignedEvent,
	LicensePlateCapturedEvent,
	PurchaseOrderRemovedEvent,
	PurchaseOrdersUpsertedEvent
} from '../events/dispatch-order.events'
import {
	DuplicatePurchaseOrderException,
	EmptyDispatchOrderException,
	PurchaseOrderNotFoundException
} from '../exceptions'

export interface PurchaseOrderLine {
	packing_id?: string
	po: string
	outbound_qty: number
	created_by: Nullish<TObjectId | Pick<IUser, '_id' | 'username' | 'display_name'>>
	updated_by?: Nullish<TObjectId | Pick<IUser, '_id' | 'username' | 'display_name'>>
	created_at: Date
	updated_at?: Nullish<Date>
	user_code_created?: Nullish<string>
	user_code_updated?: Nullish<string>
	user_name_created?: Nullish<string>
	user_name_updated?: Nullish<string>
}

export interface DispatchOrderProps {
	dispatch_order: string
	factory_code: string
	packing: PurchaseOrderLine[]
	total_outbound_qty: number
	license_plate: string | null
	container_number: string | null
	seal_number: string | null
	punctured_container: boolean
	smelling_container: boolean
	moist_container: boolean
	approval_status: TruckloadDeliveryStatus
	factory_entrance_time: Date | null
	container_sealing_time: Date | null
	factory_departure_time: Date | null
	license_plate_capture_time: Date | null
	license_plate_image: string | null
	ie_signature: string | null
	warehouse_officer_signature: string | null
	security_1_signature: string | null
	security_2_signature: string | null
	remark: string | null
	user_code_created?: string | null
	user_code_updated?: string | null
	created_by: TObjectId | null
	updated_by: TObjectId | null
	created_at?: Date | null
	updated_at?: Date | null
	/** Optimistic lock counter, incremented by the repository on every write. */
	revision: number
}

export interface DispatchOrderInfoUpdate {
	license_plate?: string | null
	container_number?: string | null
	seal_number?: string | null
	factory_entrance_time?: Date | null
	punctured_container?: boolean
	smelling_container?: boolean
	moist_container?: boolean
	remark?: string | null
}

const normalizeCode = (value: string | null | undefined): string | null => {
	const normalized = value?.trim().toUpperCase()
	return normalized ? normalized : null
}

export class DispatchOrderModel extends AggregateRoot {
	private constructor(private readonly state: DispatchOrderProps) {
		super()
	}

	static fromPersistence(props: DispatchOrderProps): DispatchOrderModel {
		return new DispatchOrderModel(props)
	}

	static create(params: {
		dispatchOrder: string
		factoryCode: string
		licensePlate?: string | null
		containerNumber?: string | null
		sealNumber?: string | null
		purchaseOrders: Array<{
			po: string
			outbound_qty: number
		}>
		createdBy: TRequestUser
	}): DispatchOrderModel {
		if (params.purchaseOrders.length === 0) throw new EmptyDispatchOrderException()
		DispatchOrderModel.assertUniquePurchaseOrders(params.purchaseOrders)

		const now = new Date()
		const packing = params.purchaseOrders.map<PurchaseOrderLine>((item) => ({
			po: item.po,
			outbound_qty: item.outbound_qty,
			created_by: params.createdBy?._id ?? null,
			updated_by: null,
			created_at: now
		}))

		const model = new DispatchOrderModel({
			dispatch_order: params.dispatchOrder,
			factory_code: params.factoryCode,
			packing,
			total_outbound_qty: 0,
			license_plate: normalizeCode(params.licensePlate),
			container_number: normalizeCode(params.containerNumber),
			seal_number: normalizeCode(params.sealNumber),
			punctured_container: false,
			smelling_container: false,
			moist_container: false,
			approval_status: TruckloadDeliveryStatus.PENDING,
			factory_entrance_time: null,
			container_sealing_time: null,
			factory_departure_time: null,
			license_plate_capture_time: null,
			license_plate_image: null,
			ie_signature: null,
			warehouse_officer_signature: null,
			security_1_signature: null,
			security_2_signature: null,
			remark: null,
			created_by: params.createdBy._id,
			updated_by: null,
			created_at: now,
			revision: 0
		})
		model.recalculateTotal()
		model.apply(new DispatchOrderCreatedEvent(params.dispatchOrder))
		return model
	}

	get dispatchOrder(): string {
		return this.state.dispatch_order
	}

	toProps(): DispatchOrderProps {
		return this.state
	}

	/** Window in which a camera snapshot is accepted as the vehicle leaving the factory. */
	get captureWindow(): { from: Date; to: Date } | null {
		const { container_sealing_time, factory_departure_time } = this.state
		if (!container_sealing_time || !factory_departure_time) return null
		return {
			from: addMinutes(container_sealing_time, LICENSE_PLATE_CAPTURE_WINDOW.AFTER_SEALING_MINUTES),
			to: addMinutes(factory_departure_time, LICENSE_PLATE_CAPTURE_WINDOW.AFTER_DEPARTURE_MINUTES)
		}
	}

	updateInfo(update: DispatchOrderInfoUpdate, updatedBy?: TRequestUser): void {
		const { license_plate, container_number, seal_number, ...rest } = omitBy(
			update,
			isUndefined
		) as DispatchOrderInfoUpdate

		if (license_plate !== undefined) {
			const plate = normalizeCode(license_plate)
			if (plate !== this.state.license_plate) this.clearCapture()
			this.state.license_plate = plate
		}
		if (container_number !== undefined) this.state.container_number = normalizeCode(container_number)
		if (seal_number !== undefined) this.state.seal_number = normalizeCode(seal_number)

		Object.assign(this.state, rest)
		this.state.updated_by = updatedBy?._id ?? this.state.updated_by

		this.apply(new DispatchOrderInfoUpdatedEvent(this.dispatchOrder))
	}

	upsertPurchaseOrders(
		items: Array<{
			po: string
			outbound_qty: number
		}>,
		updatedBy?: TRequestUser
	): void {
		DispatchOrderModel.assertUniquePurchaseOrders(items)

		const now = new Date()
		for (const item of items) {
			const existing = this.state.packing.find((line) => line.po === item.po)
			if (existing) {
				existing.outbound_qty = item.outbound_qty

				existing.updated_by = updatedBy?._id ?? existing.updated_by
			} else
				this.state.packing.push({
					po: item.po,
					outbound_qty: item.outbound_qty,
					created_by: updatedBy?._id,
					updated_by: null,
					created_at: now
				})
		}

		this.recalculateTotal()
		this.state.updated_by = updatedBy?._id ?? this.state.updated_by
		this.apply(new PurchaseOrdersUpsertedEvent(this.dispatchOrder))
	}

	/** @returns `true` when the last purchase order was removed and the dispatch order should be deleted. */
	removePurchaseOrder(po: string, removedBy?: TRequestUser): boolean {
		const index = this.state.packing.findIndex((line) => line.po === po)
		if (index < 0) throw new PurchaseOrderNotFoundException(this.dispatchOrder, po)

		this.state.packing[index].updated_by = removedBy?._id ?? null
		this.state.packing.splice(index, 1)
		this.recalculateTotal()
		this.state.updated_by = removedBy?._id ?? this.state.updated_by

		if (this.state.packing.length === 0) {
			this.apply(new DispatchOrderDeletedEvent(this.dispatchOrder))
			return true
		}

		this.apply(new PurchaseOrderRemovedEvent(this.dispatchOrder, po))
		return false
	}

	sign(
		field: DispatchOrderSignatureField,
		signature: string,
		approvalStatus: TruckloadDeliveryStatus | null | undefined,
		updatedBy?: TRequestUser,
		now: Date = new Date()
	): void {
		this.state[field] = signature
		const isConfirmed = approvalStatus === TruckloadDeliveryStatus.CONFIRMED

		if (field === 'security_1_signature') this.state.container_sealing_time = isConfirmed ? now : null
		if (field === 'security_2_signature') {
			if (approvalStatus) this.state.approval_status = approvalStatus
			this.state.factory_departure_time = isConfirmed ? now : null
		}

		this.discardOutOfWindowCapture()
		this.state.updated_by = updatedBy?._id ?? this.state.updated_by
		this.apply(new DispatchOrderSignedEvent(this.dispatchOrder, field))
	}

	updateContainerCondition(
		condition: Partial<Pick<DispatchOrderProps, 'punctured_container' | 'smelling_container' | 'moist_container'>>,
		updatedBy?: TRequestUser
	): void {
		Object.assign(this.state, omitBy(condition, isUndefined))
		this.state.updated_by = updatedBy?._id ?? this.state.updated_by
		this.apply(new ContainerConditionUpdatedEvent(this.dispatchOrder))
	}

	/**
	 * Records the camera snapshot as the actual factory departure. The latest snapshot inside the window wins.
	 * @returns `true` when the snapshot was accepted.
	 */
	applyLicensePlateCapture(snapTime: Date, image: string | null): boolean {
		if (!this.state.license_plate || !this.isWithinCaptureWindow(snapTime)) return false

		const current = this.state.license_plate_capture_time
		if (current && !isAfter(snapTime, current)) return false

		this.state.license_plate_capture_time = snapTime
		this.state.license_plate_image = image
		this.apply(new LicensePlateCapturedEvent(this.dispatchOrder, snapTime))
		return true
	}

	delete(): void {
		this.apply(new DispatchOrderDeletedEvent(this.dispatchOrder))
	}

	private isWithinCaptureWindow(time: Date): boolean {
		const window = this.captureWindow
		return !!window && !isBefore(time, window.from) && !isAfter(time, window.to)
	}

	private discardOutOfWindowCapture(): void {
		const captured = this.state.license_plate_capture_time
		if (captured && !this.isWithinCaptureWindow(captured)) this.clearCapture()
	}

	private clearCapture(): void {
		this.state.license_plate_capture_time = null
		this.state.license_plate_image = null
	}

	private recalculateTotal(): void {
		this.state.total_outbound_qty = this.state.packing.reduce((sum, line) => sum + line.outbound_qty, 0)
	}

	private static assertUniquePurchaseOrders(items: Array<{ po: string }>): void {
		const seen = new Set<string>()
		for (const { po } of items) {
			if (seen.has(po)) throw new DuplicatePurchaseOrderException(po)
			seen.add(po)
		}
	}
}
