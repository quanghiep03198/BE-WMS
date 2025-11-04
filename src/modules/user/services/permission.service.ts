import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { PermissionEntity } from '@/modules/user/entities/permission.entity'
import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, UpdateResult } from 'typeorm'

@Injectable()
export class PermissionService extends BaseAbstractService<PermissionEntity> {
	constructor(
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly syscloudDataSource: DataSource,
		@InjectRepository(PermissionEntity, DATA_SOURCE_SYSCLOUD)
		private readonly permissionRepository: Repository<PermissionEntity>
	) {
		super(permissionRepository)
	}

	override async softDeleteOneById(id: number): Promise<UpdateResult> {
		return await this.syscloudDataSource.query('UPDATE ts_wms_permission SET isactive = @0 WHERE keyid = @1', [
			'N',
			id
		])
	}
}
