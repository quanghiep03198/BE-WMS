import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { BeforeInsert, BeforeUpdate, Column, Entity, Index } from 'typeorm'
import { TruckloadDeliveryStatus } from '../constants'

@Entity({
	name: 'dv_truckload_delivery',
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	synchronize: true
})
export class TruckloadDeliveryEntity extends BaseAbstractEntity {
	@Index('IDX_delivery_dispatch_code', { unique: false })
	@Column({
		name: 'dispatch_order',
		type: 'nvarchar',
		length: 50,
		nullable: false,
		comment:
			'Dispatch order code for the truckload delivery. Format: DO-FTR-YYYYMMDD-XXX, where DO (Dispatch Order), YYYYMMDD is the create date, and XXX is a daily sequential number.'
	})
	dispatch_order: string

	@Column({
		name: 'factory_code',
		type: 'nvarchar',
		length: 10,
		nullable: false,
		comment: 'Code of the factory from which the delivery is dispatched'
	})
	factory_code: string

	@Column({
		name: 'po',
		type: 'nvarchar',
		length: 20,
		nullable: false
	})
	@Index('IDX_truckload_delivery_po')
	po: string

	@Column({
		name: 'license_plate',
		type: 'nvarchar',
		length: 50,
		nullable: true,
		comment: 'Vehicle license plate number'
	})
	license_plate: string

	@Column({
		name: 'container_number',
		type: 'nvarchar',
		length: 50,
		nullable: true,
		comment: 'Container number for the truckload delivery'
	})
	container_number: string

	@Column({
		name: 'outbound_qty',
		type: 'int',
		nullable: false,
		default: 0,
		comment: 'Quantity of goods outbound in this truckload delivery'
	})
	outbound_qty: number

	@Column({
		name: 'punctured_container',
		type: 'bit',
		nullable: false,
		default: 0,
		comment: 'Indicates if the container is punctured'
	})
	punctured_container: boolean

	@Column({
		name: 'smelling_container',
		type: 'bit',
		nullable: false,
		default: 0,
		comment: 'Indicates if the container has any smell'
	})
	smelling_container: boolean

	@Column({
		name: 'moist_container',
		type: 'bit',
		nullable: false,
		default: 0,
		comment: 'Indicates if the container has moisture',
		transformer: new BoolBitTransformer()
	})
	moist_container: boolean

	@Column({
		name: 'approval_status',
		type: 'nvarchar',
		length: 20,
		nullable: false,
		enum: TruckloadDeliveryStatus,
		default: TruckloadDeliveryStatus.PENDING,
		comment: 'Status of the truckload delivery'
	})
	approval_status: TruckloadDeliveryStatus

	@Column({
		name: 'ie_signature',
		type: 'nvarchar',
		length: 'MAX',
		nullable: true,
		comment: 'Base64 image Import-Export signature'
	})
	ie_signature: string

	@Column({
		name: 'warehouse_officer_signature',
		type: 'nvarchar',
		length: 'MAX',
		nullable: true,
		comment: 'Base64 image of the warehouse officer signature'
	})
	warehouse_officer_signature: string

	@Column({
		name: 'security_1_signature',
		type: 'nvarchar',
		length: 'MAX',
		nullable: true,
		comment: 'Base64 image of the security guard 1 signature'
	})
	security_1_signature: string

	@Column({
		name: 'security_2_signature',
		type: 'nvarchar',
		length: 'MAX',
		nullable: true,
		comment: 'Base64 image of the security guard 2 signature'
	})
	security_2_signature: string

	@Column({
		name: 'container_sealing_time',
		type: 'datetime',
		nullable: true,
		comment: 'The time when the container was sealed'
	})
	container_sealing_time: Date

	@Column({
		name: 'factory_departure_time',
		type: 'datetime',
		nullable: true,
		comment: 'The departure time from the factory'
	})
	factory_departure_time: Date

	@BeforeInsert()
	setDefaultStatus() {
		if (!this.approval_status) this.approval_status = TruckloadDeliveryStatus.PENDING
	}

	@BeforeUpdate()
	toUpperCase() {
		if (this.license_plate) this.license_plate = this.license_plate.toUpperCase()
	}
}
