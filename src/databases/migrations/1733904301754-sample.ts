import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class Sample1733904301754 implements MigrationInterface {
	private tableSchema = new Table({
		name: 'sample',
		columns: [
			{ name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
			{ name: 'firstName', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'lastName', type: 'nvarchar', length: '50', isNullable: true },
			{ name: 'email', type: 'nvarchar', length: '50', isNullable: true }
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.tableSchema, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable(this.tableSchema, false)
	}
}
