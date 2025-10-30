import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { PermissionEntity } from '@/modules/user/entities/permission.entity'
import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

@Injectable()
export class PermissionService extends BaseAbstractService<PermissionEntity> {
	constructor(
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly syscloudDataSource: DataSource,
		@InjectRepository(PermissionEntity, DATA_SOURCE_SYSCLOUD)
		private readonly permissionRepository: Repository<PermissionEntity>
	) {
		super(permissionRepository)
	}
}
