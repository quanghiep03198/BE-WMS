import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, StrictRoles, TRequestUser } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { I18nTranslations } from '@generated/i18n.generated'
import { DeleteDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/delete-defective-goods/delete-defective-goods.command'
import { UpdateDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/update-defective-goods/update-defective-goods.command'
import { UpdateInboundCommand } from '@modules/defective-goods/application/commands/update-inbound/update-inbound.command'
import { UpdateOutboundCommand } from '@modules/defective-goods/application/commands/update-outbound/update-outbound.command'
import { UpsertDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/upsert-defective-goods/upsert-defective-goods.command'
import {
	CreateDefectiveGoodsDTO,
	createDefectiveGoodsDTO,
	DeleteManyDefectiveGoodsDTO,
	deleteManyDefectiveGoodsDTO,
	UpdateDefectiveGoodsDTO,
	updateDefectiveGoodsDTO
} from '@modules/defective-goods/application/dto/defective-goods.dto'
import { FilterQueryDTO, filterQueryDTO } from '@modules/defective-goods/application/dto/filter-query.dto'
import {
	UpdateInboundStatusDTO,
	updateInboundStatusDTO,
	UpdateOutboundStatusDTO,
	updateOutboundStatusDTO
} from '@modules/defective-goods/application/dto/inoutbound.dto'
import { CheckActiveEpcsQuery } from '@modules/defective-goods/application/queries/check-active-epcs/check-active-epcs.query'
import { ExportDailyInboundReportQuery } from '@modules/defective-goods/application/queries/export-daily-inbound-report/export-daily-inbound-report.query'
import { ExportDailyOutboundReportQuery } from '@modules/defective-goods/application/queries/export-daily-outbound-report/export-daily-outbound-report.query'
import { ExportDefectiveGoodsInventoryQuery } from '@modules/defective-goods/application/queries/export-defective-goods-inventory/export-defective-goods-inventory.query'
import { GetDailyInboundReportQuery } from '@modules/defective-goods/application/queries/get-daily-inbound-report/get-daily-inbound-report.query'
import { GetDailyOutboundReportQuery } from '@modules/defective-goods/application/queries/get-daily-outbound-report/get-daily-outbound-report.query'
import { GetDefectiveGoodsInventoryQuery } from '@modules/defective-goods/application/queries/get-defective-goods-inventory/get-defective-goods-inventory.query'
import { GetDefectiveGoodsQuery } from '@modules/defective-goods/application/queries/get-defective-goods/get-defective-goods.query'
import { DefectiveGoodsService } from '@modules/defective-goods/application/services/defective-goods.service'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { DefectiveGoodsEntity } from '@modules/defective-goods/infrastructure/persistence/mssql/entities/defective-goods.entity'
import { UserRole } from '@modules/user/domain/constants'
import {
	Body,
	ConflictException,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	Query,
	Res
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ParseObjectIdPipe } from '@nestjs/mongoose'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { isEmpty, isNil, omit, pickBy } from 'lodash'
import { I18n, I18nContext, I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import z from 'zod'
import { EPCGenerator } from '../../application/helpers/epc-generator'
import { DefectiveCategory, DefectiveGoodsUnit } from '../../domain/constants'

@Controller('defective-goods')
export class DefectiveGoodsController {
	constructor(
		@InjectPinoLogger(DefectiveGoodsController.name) private readonly logger: PinoLogger,
		private readonly i18nService: I18nService,
		private readonly defectiveGoodsService: DefectiveGoodsService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
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
			size_numcode,
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
				size_numcode: size_numcode?.toUpperCase(),
				assembly_line,
				sewing_line
			},
			(item) => !isEmpty(item) && !isNil(item)
		)

		return this.queryBus.execute(
			new GetDefectiveGoodsQuery(
				{
					...filterQuery,
					...(epc && { epc: { $regex: epc.toUpperCase(), $options: 'i' } }),
					...(created && {
						created_at: {
							$gte: new Date(new Date(created).setHours(0, 0, 0, 0)),
							$lte: new Date(new Date(created).setHours(23, 59, 59, 999))
						}
					})
				},
				page,
				limit
			)
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
		@RequestUser() user: TRequestUser,
		@I18n() i18n: I18nContext<I18nTranslations>,
		@Body(new ZodValidationPipe(createDefectiveGoodsDTO)) payload: CreateDefectiveGoodsDTO
	) {
		if (payload.combination_strategy === 'uhf' && Array.isArray(payload.epc)) {
			const isActiveEpcsExist = await this.queryBus.execute(new CheckActiveEpcsQuery(payload.epc))
			if (isActiveEpcsExist)
				throw new ConflictException(i18n.t('defective-goods.active_epcs_recombination_conflict'))
			delete payload.sizes
			return this.commandBus.execute(
				new UpsertDefectiveGoodsCommand(
					payload.epc.map((item) => ({
						...(payload as unknown as Partial<IDefectiveGoods>),
						epc: item,
						unit:
							payload.defective_category === DefectiveCategory.C_GRADE
								? DefectiveGoodsUnit.PCS
								: DefectiveGoodsUnit.PRS,
						created_by: user._id
					})),
					user.username
				)
			)
		}
		if (payload.combination_strategy === 'usb' && typeof payload.epc === 'string') {
			const isActiveEpcsExist = await this.queryBus.execute(new CheckActiveEpcsQuery([payload.epc]))
			if (isActiveEpcsExist)
				throw new ConflictException(
					this.i18nService.t('defective-goods.active_epcs_recombination_conflict', {
						lang: I18nContext.current()?.lang
					})
				)
			delete payload.sizes
			return this.commandBus.execute(
				new UpsertDefectiveGoodsCommand(
					[
						{
							...(payload as unknown as Partial<IDefectiveGoods>),
							unit:
								payload.defective_category === DefectiveCategory.C_GRADE
									? DefectiveGoodsUnit.PCS
									: DefectiveGoodsUnit.PRS,
							created_by: user._id
						}
					],
					user.username
				)
			)
		}
		if (payload.combination_strategy === 'manually' && Array.isArray(payload.sizes)) {
			const generator = new EPCGenerator()

			const data = payload.sizes.flatMap(({ size_numcode, qty }) => {
				const epcs = generator.generateBatch(qty)
				return epcs.map((epc) => ({
					created_by: user._id,
					epc,
					size_numcode,
					unit:
						payload.defective_category === DefectiveCategory.C_GRADE
							? DefectiveGoodsUnit.PCS
							: (DefectiveGoodsUnit.PRS as const),
					...omit(payload, ['epc', 'sizes'])
				}))
			})

			return this.commandBus.execute(
				new UpsertDefectiveGoodsCommand(data as unknown as Partial<IDefectiveGoods>[], user.username)
			)
		}
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
		@RequestUser() user: TRequestUser,
		@Param('id', ParseObjectIdPipe) id: string,
		@Body(new ZodValidationPipe(updateDefectiveGoodsDTO)) payload: UpdateDefectiveGoodsDTO
	) {
		return this.commandBus.execute(
			new UpdateDefectiveGoodsCommand(id, { ...this.toPayload(payload), updated_by: user._id }, user.username)
		)
	}

	@RouteHandler({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async deleteOne(@RequestUser() user: TRequestUser, @Param('id', ParseObjectIdPipe) id: string) {
		return this.commandBus.execute(new DeleteDefectiveGoodsCommand([id], {}, user.username))
	}

	@RouteHandler({
		endpoint: 'delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.NO_CONTENT
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async deleteMany(
		@RequestUser() user: TRequestUser,
		@Body(new ZodValidationPipe(deleteManyDefectiveGoodsDTO)) ids: DeleteManyDefectiveGoodsDTO
	) {
		const filter = pickBy(
			{
				defective_category: ids.category,
				po: ids.po,
				mo_no: ids.mo_no,
				brand_name: ids.brand_name?.toUpperCase(),
				cust_shoes_style: ids.cust_shoes_style,
				factory_shoes_style: ids.factory_shoes_style?.toUpperCase(),
				color_sn: ids.color_sn,
				size_numcode: ids.size_numcode,
				defective_description: ids.defect_description,
				created_at: ids.created && {
					$gte: new Date(new Date(ids.created).setHours(0, 0, 0, 0)),
					$lte: new Date(new Date(ids.created).setHours(23, 59, 59, 999))
				},
				_id: Array.isArray(ids.excluding_ids) && { $nin: ids.excluding_ids }
			},
			(value) => value !== undefined && value !== null
		)
		return this.commandBus.execute(
			new DeleteDefectiveGoodsCommand(
				Array.isArray(ids.including_ids) ? ids.including_ids : [],
				filter,
				user.username
			)
		)
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
		@RequestUser() user: TRequestUser,
		@Body(new ZodValidationPipe(updateInboundStatusDTO.partial())) data: UpdateInboundStatusDTO
	) {
		return this.commandBus.execute(new UpdateInboundCommand(data, user._id, user.username))
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
		return this.queryBus.execute(new GetDailyInboundReportQuery(date))
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
		const buffer = await this.queryBus.execute(new ExportDailyInboundReportQuery(date, factoryCode))
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
		@RequestUser() user: TRequestUser,
		@Body(new ZodValidationPipe(updateOutboundStatusDTO)) data: UpdateOutboundStatusDTO
	) {
		return this.commandBus.execute(new UpdateOutboundCommand(data, user._id, user.username))
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
		return this.queryBus.execute(new GetDailyOutboundReportQuery(date))
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
		const buffer = await this.queryBus.execute(new ExportDailyOutboundReportQuery(date, factoryCode))
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
		return this.queryBus.execute(new GetDefectiveGoodsInventoryQuery())
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
		const buffer = await this.queryBus.execute(new ExportDefectiveGoodsInventoryQuery(factoryCode))
		return reply.send(buffer)
	}

	private toPayload(payload: Partial<CreateDefectiveGoodsDTO | UpdateDefectiveGoodsDTO>): IDefectiveGoods {
		const data = { ...payload } as Record<string, any>
		delete data.sizes
		return data as IDefectiveGoods
	}
}
