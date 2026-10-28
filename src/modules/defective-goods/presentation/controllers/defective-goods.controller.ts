import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, StrictRoles, TRequestUser } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { I18nTranslations } from '@generated/i18n.generated'
import { CreateDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/create-defective-goods/create-defective-goods.command'
import { DeleteManyDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/delete-many/delete-many-defective-goods.command'
import { DeleteOneDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/delete-one/delete-defective-goods.command'
import { StockInDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/stock-in/stock-in.command'
import { StockOutDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/stock-out/stock-out.command'
import { UpdateDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/update-defective-goods/update-defective-goods.command'
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
import { GetInoutboundEpcsQuery } from '@modules/defective-goods/application/queries/get-inoutbound-epcs/get-inoutbound-epcs.query'
import { GetScanningSizeQtyQuery } from '@modules/defective-goods/application/queries/get-scanning-size-qty/get-scanning-size-qty.query'
import { DefectiveGoodsService } from '@modules/defective-goods/application/services/defective-goods.service'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { UserRole } from '@modules/user/domain/constants'
import {
	Body,
	ConflictException,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseDatePipe,
	ParseIntPipe,
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
				new CreateDefectiveGoodsCommand(
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
				new CreateDefectiveGoodsCommand(
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
				new CreateDefectiveGoodsCommand(data as unknown as Partial<IDefectiveGoods>[], user.username)
			)
		}
	}

	@RouteHandler({
		endpoint: 'inoutbound-epcs/:stockFlow',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF)
	public async getCanInboundEpcs(
		@Param('stockFlow') stockFlow: 'inbound' | 'outbound',
		@Query() filters: Partial<IDefectiveGoods>,
		@Query('take', new DefaultValuePipe(15), ParseIntPipe) take: number
	) {
		return await this.queryBus.execute(new GetInoutboundEpcsQuery(stockFlow, filters, take))
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
		return this.commandBus.execute(new DeleteOneDefectiveGoodsCommand(id, user.username))
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
		@Body(new ZodValidationPipe(deleteManyDefectiveGoodsDTO)) queries: DeleteManyDefectiveGoodsDTO
	) {
		return this.commandBus.execute(new DeleteManyDefectiveGoodsCommand(queries, user.username))
	}
	// #endregion

	@RouteHandler({
		method: HttpMethod.POST,
		endpoint: 'retrieve-size-qty',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF)
	public async getScanningSizeQty(@Body() data: string[]) {
		return await this.queryBus.execute(new GetScanningSizeQtyQuery(data))
	}

	// #region Inbound
	@RouteHandler({
		method: HttpMethod.PATCH,
		endpoint: 'inbound',
		statusCode: HttpStatus.CREATED
	})
	@StrictRoles()
	@RequireAuthorized(UserRole.DG_WAREHOUSE_STAFF)
	public async stockInDefectiveGoods(
		@RequestUser() user: TRequestUser,
		@Body(new ZodValidationPipe(updateInboundStatusDTO.partial())) data: UpdateInboundStatusDTO
	) {
		return this.commandBus.execute(new StockInDefectiveGoodsCommand(data, user))
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'daily-inbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	public async getDailyInboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date()), new ParseDatePipe())
		date: Date
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
		return this.commandBus.execute(new StockOutDefectiveGoodsCommand(data, user))
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'daily-outbound',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.DG_WAREHOUSE_STAFF, UserRole.INDUSTRIAL_ENGINEERING_STAFF)
	public async getDailyOutboundReport(
		@Query('date:eq', new ZodValidationPipe(z.coerce.date()), new ParseDatePipe())
		date: Date
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
