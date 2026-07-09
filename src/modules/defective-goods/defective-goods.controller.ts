import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, StrictRoles, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import {
	Body,
	ConflictException,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query,
	Res
} from '@nestjs/common'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { isEmpty, isNil, omit, pickBy } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Between, Like } from 'typeorm'
import z from 'zod'
import { UserRole } from '../user/constants'
import { DefectiveCategory, DefectiveGoodsUnit } from './constants'
import {
	CreateDefectiveGoodsDTO,
	createDefectiveGoodsDTO,
	DeleteManyDefectiveGoodsDTO,
	deleteManyDefectiveGoodsDTO,
	UpdateDefectiveGoodsDTO,
	updateDefectiveGoodsDTO
} from './dto/defective-goods.dto'
import { FilterQueryDTO, filterQueryDTO } from './dto/filter-query.dto'
import {
	UpdateInboundStatusDTO,
	updateInboundStatusDTO,
	UpdateOutboundStatusDTO,
	updateOutboundStatusDTO
} from './dto/inoutbound.dto'
import { DefectiveGoodsEntity } from './entities/defective-goods.entity'
import { EPCGenerator } from './helpers/epc-generator'
import { DefectiveGoodsService } from './services/defective-goods.service'
import { DefectiveGoodsInboundService } from './services/defective-inbound.service'
import { DefectiveGoodsInventoryService } from './services/defective-inventory.service'
import { DefectiveGoodsOutboundService } from './services/defective-outbound.service'

@Controller('defective-goods')
export class DefectiveGoodsController {
	constructor(
		@InjectPinoLogger(DefectiveGoodsController.name) private readonly logger: PinoLogger,
		private readonly i18nService: I18nService,
		private readonly defectiveGoodsService: DefectiveGoodsService,
		private readonly defectiveGoodsInboundService: DefectiveGoodsInboundService,
		private readonly defectiveGoodsOutboundService: DefectiveGoodsOutboundService,
		private readonly defectiveGoodsInventoryService: DefectiveGoodsInventoryService
	) {}

	// #region CRUD EPC Combination
	@RouteHandler({
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF)
	public async get(
		@Query(new ZodValidationPipe(filterQueryDTO), new DefaultValuePipe({ page: 1, limit: 10 }))
		filterQueries: FilterQueryDTO
	) {
		const {
			epc,
			page,
			limit,
			created,
			brand_name,
			defective_category,
			factory_shoes_style,
			cust_shoes_style,
			po,
			mo_no,
			size_code,
			assembly_line,
			sewing_line
		} = filterQueries

		const filterQuery = pickBy(
			{
				brand_name: brand_name?.toUpperCase(),
				defective_category: defective_category?.toUpperCase(),
				factory_shoes_style: factory_shoes_style?.toUpperCase(),
				cust_shoes_style,
				po,
				mo_no: mo_no?.toUpperCase(),
				size_code: size_code?.toUpperCase(),
				assembly_line,
				sewing_line
			},
			(item) => !isEmpty(item) && !isNil(item)
		)

		return await this.defectiveGoodsService.paginate(
			{
				ri_cancel: false,
				...filterQuery,
				...(epc && { epc: Like(`%${epc.toUpperCase()}%`) }),
				...(created && {
					created: Between(
						new Date(new Date(created).setHours(0, 0, 0, 0)),
						new Date(new Date(created).setHours(23, 59, 59, 999))
					)
				})
			},
			{
				page,
				limit,
				order: { created: 'DESC' }
			}
		)
		// Todo: create new resource for defective goods
	}
	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async create(
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(createDefectiveGoodsDTO)) payload: CreateDefectiveGoodsDTO
	) {
		if (payload.ri_type === 'uhf' && Array.isArray(payload.epc)) {
			const isActiveEpcsExist: Awaited<boolean> = await this.defectiveGoodsService.checkActiveEpcsExist(payload.epc)
			if (isActiveEpcsExist)
				throw new ConflictException(
					this.i18nService.t('defective-goods.active_epcs_recombination_conflict', {
						lang: I18nContext.current()?.lang
					})
				)
			return await this.defectiveGoodsService.insertMany(
				payload.epc.map((item) => ({
					epc: item,
					user_code_created: user.username,
					unit:
						payload.defective_category === DefectiveCategory.C_GRADE
							? DefectiveGoodsUnit.PCS
							: DefectiveGoodsUnit.PRS,
					...omit(payload, ['epc'])
				}))
			)
		}
		if (payload.ri_type === 'usb' && typeof payload.epc === 'string') {
			const isActiveEpcsExist: Awaited<boolean> = await this.defectiveGoodsService.checkActiveEpcsExist(payload.epc)
			if (isActiveEpcsExist)
				throw new ConflictException(
					this.i18nService.t('defective-goods.active_epcs_recombination_conflict', {
						lang: I18nContext.current()?.lang
					})
				)
			return await this.defectiveGoodsService.insertOne({
				...payload,
				unit:
					payload.defective_category === DefectiveCategory.C_GRADE
						? DefectiveGoodsUnit.PCS
						: DefectiveGoodsUnit.PRS,
				epc: payload.epc,
				user_code_created: user.username
			})
		}
		if (payload.ri_type === 'manually' && Array.isArray(payload.sizes)) {
			const generator = new EPCGenerator()
			const data = payload.sizes.flatMap((size) => {
				const epcs = generator.generateBatch(size.qty)
				return epcs.map((epc) => ({
					epc,
					size_code: size.size_code,
					user_name_created: user.username,
					user_code_created: user.username,
					unit:
						payload.defective_category === DefectiveCategory.C_GRADE
							? DefectiveGoodsUnit.PCS
							: (DefectiveGoodsUnit.PRS as const),
					...omit(payload, ['epc', 'sizes'])
				}))
			})

			return await this.defectiveGoodsService.batchInsert(data)
		}
		// Todo: create new resource for defective goods
	}

	@RouteHandler({
		endpoint: 'inoutbound-epcs/:type',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF)
	public async getCanInboundEpcs(
		@Param('type') type: 'inbound' | 'outbound',
		@Query() queries: Partial<DefectiveGoodsEntity> & { take?: number }
	) {
		return await this.defectiveGoodsService.getCanInoutboundEpcs(type, queries)
	}

	@RouteHandler({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async updateOne(
		@User() user: RequestUser,
		@Param('id', ParseIntPipe) id: number,
		@Body(new ZodValidationPipe(updateDefectiveGoodsDTO)) payload: UpdateDefectiveGoodsDTO
	) {
		return await this.defectiveGoodsService.updateOneById(id, { ...payload, user_code_updated: user.username })
	}

	@RouteHandler({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async deleteOne(@Param('id', ParseIntPipe) id: number) {
		return await this.defectiveGoodsService.updateOneById(id, { ri_cancel: true, is_active: false })
	}

	@RouteHandler({
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async deleteMany(@Body(new ZodValidationPipe(deleteManyDefectiveGoodsDTO)) ids: DeleteManyDefectiveGoodsDTO) {
		return await this.defectiveGoodsService.deleteMany(ids)
	}
	// #endregion

	@RouteHandler({
		method: HttpMethod.POST,
		endpoint: 'retrieve-size-qty',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF)
	public async retrieveSizeQty(@Body() data: string[]) {
		return await this.defectiveGoodsService.retrieveSizeQty(data)
	}

	// #region Inbound
	@RouteHandler({
		method: HttpMethod.PATCH,
		endpoint: 'inbound',
		statusCode: HttpStatus.CREATED
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async updateInboundStatus(
		@Body(new ZodValidationPipe(updateInboundStatusDTO.partial())) data: UpdateInboundStatusDTO
	) {
		return await this.defectiveGoodsInboundService.updateInboundStatus(data)
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'daily-inbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	public async getDailyInboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date().transform((value) => format(value, 'yyyy-MM-dd'))))
		date: string
	) {
		return await this.defectiveGoodsInboundService.getDailyInboundReport(date)
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'export-daily-inbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportDailyOutboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date().transform((value) => format(value, 'yyyy-MM-dd'))))
		date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.defectiveGoodsInboundService.exportDailyInboundToExcel(date, factoryCode)
		return reply.send(buffer)
	}
	// #endregion

	// #region Outbound
	@RouteHandler({
		method: HttpMethod.PATCH,
		endpoint: 'outbound',
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async updateOutboundStatus(
		@Body(new ZodValidationPipe(updateOutboundStatusDTO)) data: UpdateOutboundStatusDTO
	) {
		return await this.defectiveGoodsOutboundService.updateOutboundStatus(data)
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'daily-outbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	public async getDailyOutboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date().transform((value) => format(value, 'yyyy-MM-dd'))))
		date: string
	) {
		return await this.defectiveGoodsOutboundService.getDailyOutboundReport(date)
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'export-daily-outbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportDailyInboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date().transform((value) => format(value, 'yyyy-MM-dd'))))
		date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.defectiveGoodsOutboundService.exportDailyOutboundToExcel(date, factoryCode)
		return reply.send(buffer)
	}

	// #endregion

	// #region Inventory
	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'inventory',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async getDefectiveGoodsInventory() {
		return await this.defectiveGoodsInventoryService.getDefectiveGoodsInventory()
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'export-inventory-report',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	async exportDefectiveGoodsInventory(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.defectiveGoodsInventoryService.exportDefectiveGoodsInventory(factoryCode)
		return reply.send(buffer)
	}
}
