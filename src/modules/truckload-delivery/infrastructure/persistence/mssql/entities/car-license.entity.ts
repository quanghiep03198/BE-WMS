import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@databases/constants'
import { format } from 'date-fns'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity({
	name: 'dv_carlicenseplates',
	schema: DATABASE_SCHEMA,
	database: DATABASE_DATA_LAKE
})
export class CarLicenseSnapshotEntity {
	@PrimaryGeneratedColumn({ name: 'keyid', type: 'int' })
	id: number

	@CreateDateColumn({ type: 'datetime', default: format(new Date(), 'yyyy-MM-dd HH:mm:ss') })
	created: Date

	@UpdateDateColumn({ type: 'datetime', nullable: true, onUpdate: 'CURRENT_TIMESTAMP' })
	updated: Date

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_code_created: string | null

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_code_updated: string | null

	@Column({ name: 'plate_name', type: 'nvarchar', length: 50, nullable: false, comment: 'Car license plate number' })
	plate_name: string

	@Column({
		name: 'images',
		type: 'nvarchar',
		length: 255,
		nullable: false,
		comment: 'License plate image was snapshot from camera'
	})
	images: string

	@Column({
		name: 'snap_time',
		type: 'datetime2',
		nullable: false,
		comment: 'License plate snapshot time from camera'
	})
	snap_time: Date
}
