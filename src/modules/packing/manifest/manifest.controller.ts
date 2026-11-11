import { CommonRequestHeader } from '@common/constants'
import { RequestUser, RequireAuthorized } from '@common/decorators'
import { HttpExceptionFilter } from '@common/filters/http-exception.filter'
import { ZodValidationPipe } from '@common/pipes'
import { UserRole } from '@modules/user/domain/constants'
import {
	Body,
	Controller,
	Get,
	Headers,
	HttpCode,
	Param,
	Post,
	Query,
	Res,
	UnprocessableEntityException,
	UseFilters,
	Version,
	VERSION_NEUTRAL
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyReply } from 'fastify'
import { Types } from 'mongoose'
import { I18nContext } from 'nestjs-i18n'
import { z } from 'zod'
import { ManifestExportService } from './manifest-export.service'
import {
	ManifestFilterDto,
	ManifestListDto,
	manifestFilterValidator,
	manifestListValidator
} from './manifest-filter.dto'
import { ManifestService } from './manifest.service'

function validateFactory(factoryCode: string) {
	const factory = z.string().trim().min(1).max(10).safeParse(factoryCode)
	if (!factory.success) throw new UnprocessableEntityException('Invalid X-User-Factory header')
	return factory.data
}

@Controller('packing-manifest')
@UseFilters(HttpExceptionFilter)
export class ManifestController {
	constructor(
		private readonly service: ManifestService,
		private readonly exports: ManifestExportService,
		private readonly config: ConfigService
	) {}

	@Get()
	@Version('2')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getPackingManifest(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query(new ZodValidationPipe(manifestListValidator)) query: ManifestListDto
	) {
		return this.service.getList(validateFactory(factoryCode), query)
	}

	@Post('exports')
	@HttpCode(200)
	@Version('2')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async createExport(
		@RequestUser('_id') userId: Types.ObjectId,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Headers('x-language') requestedLanguage: string | undefined,
		@Body(new ZodValidationPipe(manifestFilterValidator)) filter: ManifestFilterDto
	) {
		const header = z.enum(['vi', 'en', 'cn']).safeParse(requestedLanguage?.trim().toLowerCase())
		if (requestedLanguage !== undefined && !header.success) {
			throw new UnprocessableEntityException('X-Language must be vi, en or cn')
		}
		const language = header.success
			? header.data
			: (I18nContext.current()?.lang ?? this.config.get<string>('FALLBACK_LANGUAGE', 'en'))
		return this.exports.create(userId.toString(), validateFactory(factoryCode), filter, language)
	}

	@Get('exports/:jobId')
	@Version('2')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportStatus(@RequestUser('_id') userId: Types.ObjectId, @Param('jobId') jobId: string) {
		return this.exports.status(userId.toString(), jobId)
	}

	@Get('exports/:jobId/download')
	@Version([VERSION_NEUTRAL, '2'])
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async downloadExport(
		@RequestUser('_id') userId: Types.ObjectId,
		@Param('jobId') jobId: string,
		@Res() reply: FastifyReply
	) {
		const file = await this.exports.download(userId.toString(), jobId)
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const encoded = encodeURIComponent(`Danh sách đóng gói ${timestamp}.xlsx`).replace(
			/['()*]/g,
			(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
		)
		reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		reply.header(
			'Content-Disposition',
			`attachment; filename="packing-manifest-${timestamp}.xlsx"; filename*=UTF-8''${encoded}`
		)
		return reply.send(file)
	}
}
