import { Api, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import {
	StorePermissionDTO,
	storePermissionValidator,
	UpdatePermissionDTO,
	updatePermissionValidator
} from '@/modules/user/dto/permission.dto'
import { PermissionEntity } from '@/modules/user/entities/permission.entity'
import { PermissionService } from '@/modules/user/services/permission.service'
import { Body, Controller, Param } from '@nestjs/common'

@Controller('permissions')
export class PermissionController {
	constructor(private readonly permissionService: PermissionService) {}
	@Api({
		endpoint: '/',
		method: HttpMethod.GET
	})
	async getPermissions(): Promise<PermissionEntity[]> {
		return await this.permissionService.findAll()
	}

	@Api({
		endpoint: '/:id',
		method: HttpMethod.GET
	})
	async getPermission(@Param('id') id: string): Promise<PermissionEntity> {
		return await this.permissionService.findOneById(+id)
	}

	@Api({
		endpoint: '/store',
		method: HttpMethod.POST
	})
	async storePermission(@Body(new ZodValidationPipe(storePermissionValidator)) payload: StorePermissionDTO) {
		return await this.permissionService.insertOne(payload)
	}

	@Api({
		endpoint: '/update/:id',
		method: HttpMethod.PATCH
	})
	async updatePermission(
		@Param('id') id: string,
		@Body(new ZodValidationPipe(updatePermissionValidator)) payload: UpdatePermissionDTO
	) {
		return await this.permissionService.updateOneById(+id, payload)
	}

	@Api({
		endpoint: '/soft-delete/:id',
		method: HttpMethod.POST
	})
	async softDeletePermission(@Param('id') id: string) {
		return await this.permissionService.softDeleteOneById(+id)
	}

	@Api({
		endpoint: '/delete/:id',
		method: HttpMethod.DELETE
	})
	async deletePermission(@Param('id') id: string) {
		return await this.permissionService.deleteOneById(+id)
	}
}
