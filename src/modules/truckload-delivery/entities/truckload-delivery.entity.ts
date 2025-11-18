import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
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
		name: 'factory_departure_time',
		type: 'datetime',
		nullable: true,
		comment: 'The departure time from the factory'
	})
	factory_departure_time: Date

	@Column({
		name: 'outbound_qty',
		type: 'int',
		nullable: false,
		default: 0,
		comment: 'Quantity of goods outbound in this truckload delivery'
	})
	outbound_qty: number

	@Column({
		name: 'status',
		type: 'nvarchar',
		length: 20,
		nullable: false,
		enum: TruckloadDeliveryStatus,
		default: TruckloadDeliveryStatus.PENDING,
		comment: 'Status of the truckload delivery'
	})
	status: TruckloadDeliveryStatus

	@BeforeInsert()
	setDefaultStatus() {
		if (!this.status) this.status = TruckloadDeliveryStatus.PENDING
	}

	@BeforeUpdate()
	toUpperCase() {
		if (this.license_plate) this.license_plate = this.license_plate.toUpperCase()
	}
}
