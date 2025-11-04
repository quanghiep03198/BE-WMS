import { DATABASE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { UserRoles } from '@/modules/user/constants'
import { Column, Entity, Index } from 'typeorm'

@Entity('ts_wms_permission', { database: DATABASE_SYSCLOUD })
export class PermissionEntity extends BaseAbstractEntity {
	@Index({ unique: true })
	@Column({
		name: 'permission_name',
		type: 'nvarchar',
		length: 100
	})
	permission_name: string

	@Column({
		name: 'role',
		type: 'nvarchar',
		length: 20,
		enum: UserRoles,
		default: UserRoles.USER
	})
	role: UserRoles

	@Column({
		name: 'parent_id',
		type: 'int',
		nullable: true
	})
	parent_id: number
}
