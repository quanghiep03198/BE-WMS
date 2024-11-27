import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_DATA_LAKE } from '../constants'

export class TransferOrder1732693096348 implements MigrationInterface {
	private tableSchema = new Table({
		database: DATABASE_DATA_LAKE,
		name: 'dv_transferordermst',
		columns: [
			{ name: 'keyid', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
			{ name: 'cofactory_code', type: 'nvarchar', length: '10' },
			{ name: 'custbrand_id', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'brand_name', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'transfer_order_code', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'kg_no', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'mo_no', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'or_no', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'or_custpo', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'shoestyle_codefactory', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'or_warehouse', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'or_location', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'al_warehouse', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'new_warehouse', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'new_location', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'new_al_warehouse', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'status_approve', type: 'nvarchar', length: '10', isNullable: true },
			{ name: 'employee_name_approve', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'approve_date', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'user_code_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_code_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'created', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: true },
			{ name: 'updated', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: true },
			{ name: 'isactive', type: 'varchar', length: '1', isNullable: true, default: "'A'" },
			{ name: 'remark', type: 'nvarchar', length: '255', isNullable: true }
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable(this.tableSchema, false)
	}
}
