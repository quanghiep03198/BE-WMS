import { MigrationInterface, QueryRunner } from 'typeorm'
import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '../constants'

export class DefectiveDescriptionUnicode1790726400001 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE [${DATABASE_DATA_LAKE}].[${DATABASE_SCHEMA}].[dv_defective_goods] ALTER COLUMN [defective_description] nvarchar(max) NOT NULL`
		)
	}

	public async down(): Promise<void> {
		throw new Error('Cannot revert defective_description to SQL Server text without risking Unicode data loss')
	}
}
