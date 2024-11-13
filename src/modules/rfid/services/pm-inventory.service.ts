import { FileLogger } from '@/common/helpers/file-logger.helper'
import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Injectable, Logger } from '@nestjs/common'
import { groupBy, isNil } from 'lodash'
import { Brackets, IsNull, Like } from 'typeorm'
import { InventoryActions } from '../constants'
import { type DeleteOrderDTO, type UpdatePMStockDTO } from '../dto/pm-inventory.dto'
import { PMInventoryEntity } from '../entities/pm-inventory.entity'
import { RFIDPMEntity } from '../entities/rfid-pm.entity'

interface BaseFetchDataArgs {
	factoryCode: string
	producingProcess: string
}

interface FetchLatestDataArgs extends BaseFetchDataArgs {
	page: number
	selectedOrder?: string
}

@Injectable()
export class PMInventoryService {
	private readonly LIMIT_FETCH_DOCS = 50

	constructor(private readonly tenancyService: TenancyService) {}

	async fetchLastestDataByProcess(args: FetchLatestDataArgs) {
		const stationNoPattern = `%${args.factoryCode}_${args.producingProcess}%`

		const getEpcQueryBuilder = this.tenancyService.dataSource
			.createQueryBuilder()
			.select([/* SQL */ `rec.epc AS epc`, /* SQL */ `rec.mo_no AS mo_no`])
			.distinct(true)
			.from(PMInventoryEntity, 'rec')
			.leftJoin(RFIDPMEntity, 'match', /* SQL */ `rec.epc = match.epc AND rec.mo_no = match.mo_no`)
			.where(/* SQL */ `rec.rfid_status IS NULL`)
			.andWhere(/* SQL */ `rec.station_no LIKE :stationNoPattern`, { stationNoPattern })
			.andWhere(/* SQL */ `match.ri_cancel = 0`)
			.andWhere(
				new Brackets((qb) => {
					if (isNil(args.selectedOrder)) return qb
					else if (args.selectedOrder === 'null') return qb.andWhere(/* SQL */ `rec.mo_no IS NULL`)
					else return qb.andWhere(/* SQL */ `rec.mo_no = :selectedOrder`, { selectedOrder: args.selectedOrder })
				})
			)
			.orderBy('mo_no', 'ASC')
			.addOrderBy('epc', 'ASC')
			.offset((args.page - 1) * this.LIMIT_FETCH_DOCS)
			.limit(this.LIMIT_FETCH_DOCS)
			.maxExecutionTime(1000)

		const [epcs, totalDocs, orders] = await Promise.all([
			getEpcQueryBuilder.getRawMany(),
			getEpcQueryBuilder.getCount(),
			this.getOrderSizes(args)
		])

		const totalPages = Math.ceil(totalDocs / this.LIMIT_FETCH_DOCS)

		const response = {
			epcs: {
				data: epcs,
				limit: this.LIMIT_FETCH_DOCS,
				page: args.page,
				totalDocs,
				totalPages,
				hasNextPage: args.page < totalPages,
				hasPrevPage: args.page > 1
			} satisfies Pagination<Record<'epc' | 'mo_no', string>>,
			orders: groupBy(orders, 'mo_no')
		}

		return response
	}

	/**
	 * @description Get manufacturing order sizes
	 */
	async getOrderSizes(args: FetchLatestDataArgs) {
		const stationNoPattern = `%${args.factoryCode}_${args.producingProcess}%`
		return await this.tenancyService.dataSource
			.getRepository(PMInventoryEntity)
			.createQueryBuilder('rec')
			.select([
				/* SQL */ `rec.mo_no AS mo_no`,
				/* SQL */ `match.mat_code AS mat_code`,
				/* SQL */ `match.shoestyle_codefactory AS shoes_style_code_factory`,
				/* SQL */ `match.size_numcode AS size_numcode`,
				/* SQL */ `
					CASE WHEN match.sole_tag = 'A' 
						THEN COUNT(DISTINCT rec.epc)
						ELSE COUNT(rec.epc)  
					END AS count`
			])
			.leftJoin(RFIDPMEntity, 'match', /* SQL */ `rec.epc = match.epc AND rec.mo_no = match.mo_no`)
			.where(/* SQL */ `rec.rfid_status IS NULL`)
			.andWhere(/* SQL */ `rec.station_no LIKE :stationNoPattern`, { stationNoPattern })
			.andWhere(/* SQL */ `match.ri_cancel = 0`)
			.groupBy('rec.mo_no')
			.addGroupBy('match.mat_code')
			.addGroupBy('match.shoestyle_codefactory')
			.addGroupBy('match.size_numcode')
			.addGroupBy('match.sole_tag')
			.orderBy('mo_no', 'ASC')
			.addOrderBy('shoestyle_codefactory', 'ASC')
			.addOrderBy('size_numcode', 'ASC')
			.maxExecutionTime(1000)
			.getRawMany()
	}

	async updateStock(payload: UpdatePMStockDTO) {
		const stationNoPattern = `%${payload.factoryCode}_${payload.producingPrcess}%`
		console.log(payload.order)
		return await this.tenancyService.dataSource.getRepository(PMInventoryEntity).update(
			{
				mo_no: payload.order === 'null' ? IsNull() : payload.order,
				rfid_status: IsNull(),
				station_no: Like(stationNoPattern)
			},
			{ rfid_status: InventoryActions.INBOUND }
		)
	}

	async deleteUnexpectedOrder(args: DeleteOrderDTO & { factoryCode: string }) {
		const stationNoPattern = `%${args.factoryCode}_${args.process}%`

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			const rs1 = await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from('DV_DATA_LAKE.dbo.UHF_RFID_TEST')
				.where(
					'epc IN (' +
						queryRunner.manager
							.createQueryBuilder()
							.select('EPC_Code', 'epc')
							.from(/* SQL */ `DV_DATA_LAKE.dbo.dv_RFIDrecordmst`, 'dv')
							.where(
								/* SQL */ `
									(LOWER(:order) = 'null' AND dv.mo_no IS NULL) 
									OR (:order <> 'null' AND dv.mo_no = :order)`,
								{ order: args.order }
							)
							.andWhere(/* SQL */ `dv.stationNO LIKE :stationNoPattern`, { stationNoPattern })
							.andWhere(/* SQL */ `dv.rfid_status IS NULL`)
							.getQuery() +
						')'
				)
				.setParameters({ order: args.order, stationNoPattern })
				.execute()

			const rs2 = await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(PMInventoryEntity)
				.where({ mo_no: String(args.order).toLowerCase() === 'null' ? IsNull() : args.order })
				.andWhere({ rfid_status: IsNull() })
				.andWhere({ station_no: Like(stationNoPattern) })
				.execute()

			await queryRunner.commitTransaction()

			Logger.debug({ rs1, rs2 })
		} catch (e) {
			queryRunner.rollbackTransaction()
			FileLogger.error(e)
		} finally {
			await queryRunner.release()
		}
	}
}
