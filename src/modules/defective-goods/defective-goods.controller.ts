import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { FileFieldsInterceptor, StorageFile, UploadedFiles } from '@blazity/nest-file-fastify'
import { Controller, HttpStatus, UseInterceptors } from '@nestjs/common'

@Controller('defective-goods')
export class DefectiveGoodsController {
	@Api({
		endpoint: 'upload-defective-images',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	@UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 4 }]))
	public async uploadDefectiveGoodsImage(@UploadedFiles() files: StorageFile[]) {
		// Todo: Implements upload image to Google Drive via Google API
		console.log(files)
	}

	@Api({
		endpoint: 'unlink-defective-images',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT
	})
	@AuthGuard()
	public async unlinkDefectiveImages() {
		// Todo: Unlink uploaded images
	}

	@Api({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async storedDefectiveGoods() {
		// Todo: create new resource for defective goods
	}

	@Api({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	public async updateDefectiveGoods() {
		// Todo: update exisited defective goods resource
	}

	@Api({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT
	})
	@AuthGuard()
	public async deleteDefectiveGoods() {
		// Todo: Delete existed defective goods resource
	}
}
