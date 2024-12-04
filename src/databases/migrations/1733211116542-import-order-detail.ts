import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_DATA_LAKE } from '../constants'

export class ImportOrderDetail1733211116542 implements MigrationInterface {
	private tableSchema = new Table({
		name: 'dv_whiodet',
		database: DATABASE_DATA_LAKE,
		columns: [
			{ name: 'keyid', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
			{ name: 'user_code_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_code_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'created', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
			{ name: 'updated', type: 'datetime', isNullable: true },
			{ name: 'isactive', type: 'varchar', length: '1', default: `'A'` },
			{ name: 'sno_no', type: 'nvarchar', length: '50' },
			{ name: 'custbrand_id', type: 'nvarchar', length: '50' },
			{ name: 'sno_templink', type: 'nvarchar', length: '20' },
			{ name: 'mo_templink', type: 'nvarchar', length: '20' },
			{ name: 'mo_no', type: 'nvarchar', length: '20' },
			{ name: 'sno_boxqty', type: 'numeric' },
			{ name: 'sno_qty', type: 'numeric', isNullable: true },
			{ name: 'storage_num', type: 'nvarchar', length: '50' },
			{ name: 'is_bgrade', type: 'bit', default: 0 },
			{ name: 'employee_code', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'employee_name', type: 'nvarchar', length: '50', isNullable: true },
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
