import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_SCHEMA, DATABASE_SYSCLOUD } from '../constants'

export class RefreshTokens1769534028893 implements MigrationInterface {
	private readonly table = new Table({
		name: 'ts_refresh_tokens',
		database: DATABASE_SYSCLOUD,
		schema: DATABASE_SCHEMA,
		columns: [
			{
				name: 'id',
				type: 'int',
				isPrimary: true,
				isGenerated: true,
				generationStrategy: 'increment'
			},
			{
				name: 'token_hash',
				type: 'nvarchar',
				length: 'max',
				isNullable: false,
				comment: 'Opaque hashed token'
			},
			{
				name: 'username',
				type: 'nvarchar',
				length: '50',
				isNullable: false
			},
			{
				name: 'expires_at',
				type: 'datetime',
				isNullable: false
			},
			{
				name: 'revoked_at',
				type: 'datetime',
				isNullable: true
			}
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.table, true, false, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable(this.table, true, false, true)
	}
}
