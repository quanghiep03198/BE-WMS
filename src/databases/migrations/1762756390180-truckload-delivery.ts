import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { TruckloadDeliveryStatus } from '@/modules/truckload-delivery/constants'
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'
import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '../constants'

export class TruckloadDelivery1762756390180 implements MigrationInterface {
	private readonly tableSchema = new Table({
		database: DATABASE_DATA_LAKE,
		schema: DATABASE_SCHEMA,
		name: 'dv_truckload_delivery',
		columns: [
			...BaseAbstractEntity.BASE_COLUMNS.map((col) => {
				if (col.name === 'keyid') return { ...col, primaryKeyConstraintName: 'PK_dv_truckload_delivery' }
				else return col
			}),
			{
				name: 'dispatch_order',
				type: 'nvarchar',
				length: '50',
				isNullable: false,
				comment:
					'Dispatch order code for the truckload delivery. Format: DO-YYYYMMDD-XXX, where DO (Dispatch Order), YYYYMMDD is the create date, and XXX is a daily sequential number.'
			},
			{
				name: 'factory_code',
				type: 'nvarchar',
				length: '10',
				isNullable: false,
				comment: 'Code of the factory from which the delivery is dispatched'
			},
			{
				name: 'license_plate',
				type: 'nvarchar',
				length: '50',
				isNullable: true,
				comment: 'Vehicle license plate number'
			},
			{
				name: 'container_number',
				type: 'nvarchar',
				length: '50',
				isNullable: true,
				comment: 'Container number for the truckload delivery'
			},
			{
				name: 'factory_departure_time',
				type: 'datetime',
				isNullable: true,
				comment: 'The departure time from the factory'
			},
			{
				name: 'po',
				type: 'nvarchar',
				length: '20',
				isNullable: false,
				comment: 'Purchase Order number'
			},
			{
				name: 'outbound_qty',
				type: 'int',
				isNullable: false,
				default: 0,
				comment: 'Quantity of goods outbound in this truckload delivery'
			},
			{
				name: 'status',
				type: 'nvarchar',
				length: '20',
				isNullable: false,
				enum: Object.values(TruckloadDeliveryStatus),
				comment: 'Status of the truckload delivery'
			}
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true)
		await queryRunner.createIndices(this.tableSchema, [
			new TableIndex({
				name: 'IDX_dispatch_order',
				columnNames: ['dispatch_order'],
				isUnique: false
			}),
			new TableIndex({
				name: 'IDX_truckload_delivery_po',
				columnNames: ['po'],
				isUnique: false
			})
		])
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropPrimaryKey(this.tableSchema, 'PK_dv_truckload_delivery')
		await queryRunner.dropTable(this.tableSchema, true, true, true)
	}
}
