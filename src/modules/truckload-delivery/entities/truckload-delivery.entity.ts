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
	@Column({
		name: 'po',
		type: 'nvarchar',
		length: 20,
		nullable: false
	})
	@Index('IDX_delivery_po')
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
<<<<<<< HEAD
=======
		default: 'CURRENT_TIMESTAMP',
>>>>>>> 935a5d29fa1aa39bb887da5e3df305048882eba6
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
