import { MigrationInterface, QueryRunner, Table } from 'typeorm'

/**
 * Sample Migration
 * @classdesc Using migration API to write migrations
 */
export class Sample1726683392647 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'sample',
				columns: [
					{
						name: 'id',
						type: 'int',
						isPrimary: true
					},
					{
						name: 'sample_column',
						type: 'varchar'
					}
				]
			}),
			true
		)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('sample')
	}
}
