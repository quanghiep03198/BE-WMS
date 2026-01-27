import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { MigrationInterface, QueryRunner, Table } from 'typeorm'
import { DATABASE_SCHEMA, DATABASE_SYSCLOUD } from '../constants'

export class Users1768439528524 implements MigrationInterface {
	private readonly table = new Table({
		database: DATABASE_SYSCLOUD,
		schema: DATABASE_SCHEMA,
		name: 'ts_users',
		columns: [
			...BaseAbstractEntity.BASE_COLUMNS.map((col) => {
				if (col.name === 'keyid') return { ...col, primaryKeyConstraintName: 'PK_ts_users' }
				else return col
			}),
			{
				name: 'username',
				type: 'nvarchar',
				length: '50',
				isNullable: false,
				isUnique: true
			},
			{
				name: 'password',
				type: 'nvarchar',
				length: '255',
				isNullable: false
			},
			{
				name: 'email',
				type: 'nvarchar',
				length: '100',
				isNullable: true,
				isUnique: true
			},
			{
				name: 'display_name',
				type: 'nvarchar',
				length: '100',
				isNullable: false
			},
			{
				name: 'employee_code',
				type: 'nvarchar',
				length: '100',
				isNullable: true
			},
			{
				name: 'roles',
				type: 'nvarchar',
				length: '255',
				isNullable: false,
				comment: 'JSON array of roles'
			},
			{
				name: 'password_changed_at',
				type: 'datetime',
				isNullable: true
			},
			{
				name: 'last_login_at',
				type: 'datetime',
				isNullable: true
			},
			{
				name: 'password_reset_required',
				type: 'bit',
				isNullable: true
			},
			{
				name: 'authorized_factory_codes',
				type: 'nvarchar',
				length: '255',
				isNullable: true,
				comment: 'JSON array of authorized factory codes'
			}
		],
		indices: [
			{
				name: 'UQ_ts_users_username',
				columnNames: ['username'],
				isUnique: true
			},
			{
				name: 'UQ_ts_users_email',
				columnNames: ['email'],
				isUnique: true,
				where: 'email IS NOT NULL'
			},
			{
				name: 'UQ_ts_users_employee_code',
				columnNames: ['employee_code'],
				isUnique: true,
				where: 'employee_code IS NOT NULL'
			}
		]
	})

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(this.table, true, false, true)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable(this.table, true, true, true)
	}
}
