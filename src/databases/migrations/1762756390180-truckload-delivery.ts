import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'
import { DATABASE_DATA_LAKE } from '../constants'

export class TruckloadDelivery1762756390180 implements MigrationInterface {
	private readonly tableSchema = new Table({
		name: 'dv_truckload_delivery',
		database: DATABASE_DATA_LAKE,
		schema: 'dbo',
		columns: [
			...BaseAbstractEntity.BASE_COLUMNS.map((col) => {
				if (col.name === 'keyid') return { ...col, primaryKeyConstraintName: 'PK_dv_truckload_delivery' }
				else return col
			}),
			{
				name: 'po',
				type: 'nvarchar',
				length: '20',
				isNullable: false,
				comment: 'Purchase Order number'
			},
			{
				name: 'license_plate',
				type: 'nvarchar',
				length: '50',
				isNullable: false,
				comment: 'Vehicle license plate number'
			},
			{
				name: 'container_number',
				type: 'nvarchar',
				length: '50',
				isNullable: false,
				comment: 'Container number for the truckload delivery'
			},
			{
				name: 'factory_departure_time',
				type: 'datetime',
				isNullable: false,
				default: 'CURRENT_TIMESTAMP',
				comment: 'The departure time from the factory'
			},
			{
				name: 'outbound_qty',
				type: 'int',
				isNullable: false,
				default: 0,
				comment: 'Quantity of goods outbound in this truckload delivery'
			}
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true)
		await queryRunner.createIndex(
			this.tableSchema,
			new TableIndex({
				name: 'IDX_delivery_po',
				columnNames: ['po']
			})
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropPrimaryKey(this.tableSchema, 'PK_dv_truckload_delivery')
		await queryRunner.dropTable(this.tableSchema, true)
	}
}
