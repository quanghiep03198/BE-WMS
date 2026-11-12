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
import { FastifyReply } from 'fastify'
import { Types } from 'mongoose'
import { I18nService } from 'nestjs-i18n'
import { z } from 'zod'
import {
	ManifestFilterDto,
	manifestFilterValidator,
	ManifestListDto,
	manifestListValidator
} from '../dto/manifest-filter.dto'
import { manifestTitle } from '../helpers/manifest-title'
import { ManifestExportService } from '../services/manifest-export.service'
import { ManifestService } from '../services/manifest.service'

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
		private readonly i18n: I18nService
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
		const language = header.success ? header.data : 'en'
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
		const timestamp = new Date(file.timestamp).toISOString().replace(/[:.]/g, '-')
		const title = Array.from(
			manifestTitle(this.i18n, file.factoryCode, file.language, file.timestamp),
			(character) => (character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? ' ' : character)
		)
			.join('')
			.trim()
		const encoded = encodeURIComponent(`${title}.xlsx`).replace(
			/['()*]/g,
			(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
		)
		reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		reply.header(
			'Content-Disposition',
			`attachment; filename="packing-manifest-${timestamp}.xlsx"; filename*=UTF-8''${encoded}`
		)
		return reply.send(file.stream)
	}
}
