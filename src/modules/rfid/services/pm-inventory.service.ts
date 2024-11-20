import { RecordStatus } from '@/databases/constants'
import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Injectable } from '@nestjs/common'
import { groupBy, isNil } from 'lodash'
import { Brackets, IsNull, Like } from 'typeorm'
import { InventoryActions } from '../constants'
import { type DeleteOrderQueriesDTO, type UpdatePMStockParamsDTO } from '../dto/pm-inventory.dto'
import { PMInventoryEntity } from '../entities/pm-inventory.entity'
import { RFIDPMEntity } from '../entities/rfid-pm.entity'
import { FetchLatestPMDataArgs } from '../rfid.interface'

@Injectable()
export class PMInventoryService {
	constructor(private readonly tenancyService: TenancyService) {}

	async fetchLastestDataByProcess(args: FetchLatestPMDataArgs) {
		const LIMIT_FETCH_DOCS = 50

		const stationNoPattern = `%${args['factory_code.eq']}_${args['producing_process.eq']}%`

		const getEpcQueryBuilder = this.tenancyService.dataSource
			.createQueryBuilder()
			.select([/* SQL */ `inv.epc AS epc`, /* SQL */ `inv.mo_no AS mo_no`])
			.distinct(true)
			.from(PMInventoryEntity, 'inv')
			.leftJoin(RFIDPMEntity, 'match', /* SQL */ `inv.epc = match.epc AND inv.mo_no = match.mo_no`)
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.station_no LIKE :stationNoPattern`, { stationNoPattern })
			.andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `match.ri_cancel = 0`)
			.andWhere(/* SQL */ `inv.is_active = :isActive`, { isActive: RecordStatus.ACTIVE })
			.andWhere(
				new Brackets((qb) => {
					if (isNil(args['mo_no.eq'])) return qb
					else if (args['mo_no.eq'] === 'null') return qb.andWhere(/* SQL */ `inv.mo_no IS NULL`)
					else return qb.andWhere(/* SQL */ `inv.mo_no = :selectedOrder`, { selectedOrder: args['mo_no.eq'] })
				})
			)
			.orderBy('mo_no', 'ASC')
			.addOrderBy('epc', 'ASC')
			.offset((args.page - 1) * LIMIT_FETCH_DOCS)
			.limit(LIMIT_FETCH_DOCS)
			.maxExecutionTime(1000)

		const [epcs, orders] = await Promise.all([
			getEpcQueryBuilder.getRawMany(),
			// getEpcQueryBuilder.getCount(),
			this.getOrderSizes(args)
		])

		const scannedOrders = Object.entries(groupBy(orders, 'mo_no')).map(([order, sizes]) => ({
			mo_no: order,
			mat_code: sizes[0].mat_code,
			shoes_style_code_factory: sizes[0].shoes_style_code_factory,
			sizes: sizes
				.map((size) => ({
					size_numcode: size.size_numcode,
					count: size.count
				}))
				.sort((s1, s2) => s1.size_numcode - s2.size_numcode)
		}))

		const totalDocs = scannedOrders
			.filter((item) => {
				if (!args['mo_no.eq']) return true
				return item.mo_no === args['mo_no.eq']
			})
			.reduce((acc, curr) => acc + curr.sizes.reduce((_acc, _curr) => _acc + _curr.count, 0), 0)

		const totalPages = Math.ceil(totalDocs / LIMIT_FETCH_DOCS)

		const scannedEpcs = {
			data: epcs,
			limit: LIMIT_FETCH_DOCS,
			page: args.page,
			totalDocs,
			totalPages,
			hasNextPage: args.page < totalPages,
			hasPrevPage: args.page > 1
		} satisfies Pagination<Record<'epc' | 'mo_no', string>>

		const response = {
			epcs: scannedEpcs,
			orders: scannedOrders
		}

		return response
	}

	/**
	 * @description Get manufacturing order sizes
	 */
	async getOrderSizes(args: FetchLatestPMDataArgs) {
		const stationNoPattern = `%${args['factory_code.eq']}_${args['producing_process.eq']}%`

		return await this.tenancyService.dataSource
			.getRepository(PMInventoryEntity)
			.createQueryBuilder('inv')
			.select([
				/* SQL */ `match.mo_no AS mo_no`,
				/* SQL */ `match.mat_code AS mat_code`,
				/* SQL */ `match.shoestyle_codefactory AS shoes_style_code_factory`,
				/* SQL */ `match.size_numcode AS size_numcode`,
				/* SQL */ `match.sole_tag AS sole_tag`,
				/* SQL */ `
					CASE WHEN match.sole_tag = 'A' 
						THEN COUNT(DISTINCT inv.epc)
						ELSE COUNT(inv.epc)  
					END AS count`
			])
			.leftJoin(RFIDPMEntity, 'match', /* SQL */ `inv.epc = match.epc AND inv.mo_no = match.mo_no`)
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.station_no LIKE :stationNoPattern`, { stationNoPattern })
			.andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `match.ri_cancel = 0`)
			.andWhere(/* SQL */ `inv.is_active = :isActive`, { isActive: RecordStatus.ACTIVE })
			.groupBy('match.mo_no')
			.addGroupBy('match.mat_code')
			.addGroupBy('match.shoestyle_codefactory')
			.addGroupBy('match.size_numcode')
			.addGroupBy('match.sole_tag')
			.orderBy('mo_no', 'ASC')
			.addOrderBy('shoestyle_codefactory', 'ASC')
			.addOrderBy('size_numcode', 'ASC')
			.addOrderBy('count', 'ASC')
			.maxExecutionTime(1000)
			.getRawMany()
	}

	async updateStock(payload: UpdatePMStockParamsDTO) {
		const stationNoPattern = `%${payload['factory_code.eq']}_${payload['producing_process.eq']}%`

		return await this.tenancyService.dataSource.getRepository(PMInventoryEntity).update(
			{
				mo_no: payload['mo_no.eq'] === 'null' ? IsNull() : payload['mo_no.eq'],
				rfid_status: IsNull(),
				station_no: Like(stationNoPattern)
			},
			{ rfid_status: InventoryActions.INBOUND }
		)
	}

	/**
	 * @deprecated
	 */
	async deleteUnexpectedOrder(args: DeleteOrderQueriesDTO) {
		const stationNoPattern = `%${args['factory_code.eq']}_${args['producing_process.eq']}%`

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(/* SQL */ `DV_DATA_LAKE.dbo.UHF_RFID_TEST`)
				.where(
					/* SQL */ `epc IN (${queryRunner.manager
						.createQueryBuilder()
						.select('EPC_Code', 'epc')
						.from(/* SQL */ `DV_DATA_LAKE.dbo.dv_RFIDrecordmst`, 'dv')
						.where(
							/* SQL */ `
								(LOWER(:order) = 'null' AND dv.mo_no IS NULL) 
								OR (:order <> 'null' AND dv.mo_no = :order)`,
							{ order: args['mo_no.eq'] }
						)
						.andWhere(/* SQL */ `dv.stationNO LIKE :stationNoPattern`, { stationNoPattern })
						.andWhere(/* SQL */ `dv.rfid_status IS NULL`)
						.getQuery()}
					)`
				)
				.setParameters({ order: args['mo_no.eq'], stationNoPattern })
				.execute()

			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(PMInventoryEntity)
				.where({ mo_no: String(args['mo_no.eq']).toLowerCase() === 'null' ? IsNull() : args['mo_no.eq'] })
				.andWhere({ rfid_status: IsNull() })
				.andWhere({ station_no: Like(stationNoPattern) })
				.execute()

			await queryRunner.commitTransaction()
		} catch {
			queryRunner.rollbackTransaction()
		} finally {
			await queryRunner.release()
		}
	}

	async softDeleteUnexpectedOrder(args: DeleteOrderQueriesDTO) {
		const stationNoPattern = `%${args['factory_code.eq']}_${args['producing_process.eq']}%`

		return await this.tenancyService.dataSource.getRepository(PMInventoryEntity).update(
			{
				mo_no: args['mo_no.eq.eq'] === 'null' ? IsNull() : args['mo_no.eq'],
				// record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')),
				is_active: RecordStatus.ACTIVE,
				rfid_status: IsNull(),
				station_no: Like(stationNoPattern)
			},
			{
				is_active: RecordStatus.INACTIVE
			}
		)
	}
}
