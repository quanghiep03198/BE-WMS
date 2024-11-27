import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_DATA_LAKE } from '../constants'

export class TransferOrderDetail1732694435641 implements MigrationInterface {
	private tableSchema = new Table({
		database: DATABASE_DATA_LAKE,
		name: 'dv_transferorderdet',
		columns: [
			{ name: 'keyid', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
			{ name: 'transfer_order_code', type: 'nvarchar', length: '50' },
			{ name: 'seqno', type: 'nvarchar', length: '20', isNullable: true },
			{ name: 'or_no', type: 'nvarchar', length: '20' },
			{ name: 'trans_num', type: 'int', default: 0 },
			{ name: 'sno_qty', type: 'int', default: 0 },
			{ name: 'or_qtyperpacking', type: 'int', default: 0 },
			{ name: 'kg_nostart', type: 'int', default: 0 },
			{ name: 'kg_noend', type: 'int', default: 0 },
			{ name: 'user_code_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_created', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_code_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'user_name_updated', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'created', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
			{ name: 'updated', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
			{ name: 'isactive', type: 'varchar', length: '1', default: `'A'` },
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
