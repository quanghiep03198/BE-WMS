import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Injectable, Logger } from '@nestjs/common'
import { groupBy, isNil, uniqBy } from 'lodash'
import { In, IsNull, Like, Or } from 'typeorm'
import { InventoryActions } from '../constants'
import { UpdateStockDTO } from '../dto/pm-inventory.dto'
import { PMInventoryEntity } from '../entities/pm-inventory.entity'
import { RFIDPMEntity } from '../entities/rfid-pm.entity'

type FetchLatestDataArgs = { factoryCode: string; producingProcess: string; page: number }

@Injectable()
export class PMInventoryService {
	constructor(private readonly tenancyService: TenancyService) {}

	async fetchLastestDataByProcess(args: FetchLatestDataArgs) {
		const LIMIT_FETCH_DOCS = 50
		const stationNoPattern = `%${args.factoryCode}_${args.producingProcess}%`
		const [[epcs, totalDocs], sizes] = await Promise.all([
			this.tenancyService.dataSource.getRepository(PMInventoryEntity).findAndCount({
				select: ['epc', 'mo_no'],
				where: {
					rfid_status: IsNull(),
					station_no: Like(stationNoPattern)
					// record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd'))
				},
				take: LIMIT_FETCH_DOCS,
				skip: (args.page - 1) * LIMIT_FETCH_DOCS
			}),
			this.getOrderSizes(args)
		])

		const totalPages = Math.ceil(totalDocs / LIMIT_FETCH_DOCS)

		const response = {
			epcs: {
				data: epcs,
				limit: LIMIT_FETCH_DOCS,
				page: args.page,
				totalDocs,
				totalPages,
				hasNextPage: args.page < totalPages,
				hasPrevPage: args.page > 1
			} satisfies Pagination<Record<'epc' | 'mo_no', string>>,
			orders: uniqBy(sizes, 'mo_no').map((item) => item.mo_no),
			sizes: groupBy(sizes, 'mo_no')
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
			.createQueryBuilder('inv')
			.select([
				/* SQL */ `inv.mo_no AS mo_no`,
				/* SQL */ `pm.mat_code AS mat_code`,
				/* SQL */ `pm.shoestyle_codefactory AS shoes_style_code_factory`,
				/* SQL */ `pm.size_numcode AS size_numcode`,
				/* SQL */ `COUNT(DISTINCT inv.EPC_Code) AS count`
			])
			.leftJoin(RFIDPMEntity, 'pm', /* SQL */ `inv.EPC_Code = pm.EPC_Code AND  inv.mo_no = pm.mo_no`)
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			// .andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `inv.station_no LIKE '%${stationNoPattern}%'`)
			.groupBy('inv.mo_no')
			.addGroupBy('pm.mat_code')
			.addGroupBy('pm.shoestyle_codefactory')
			.addGroupBy('pm.size_numcode')
			.orderBy('mo_no', 'ASC')
			.addOrderBy('shoestyle_codefactory', 'ASC')
			.addOrderBy('size_numcode', 'ASC')
			.maxExecutionTime(1000)
			.getRawMany()
	}

	async updateStock(payload: UpdateStockDTO) {
		const filteredPayload = payload.orders.filter((item) => !isNil(item))
		const hasSomeUnknownOrder = payload.orders.length !== filteredPayload.length

		const result = await this.tenancyService.dataSource.getRepository(PMInventoryEntity).update(
			{
				mo_no: hasSomeUnknownOrder ? Or(IsNull(), In(filteredPayload)) : In(filteredPayload),
				rfid_status: IsNull()
			},
			{ rfid_status: InventoryActions.INBOUND }
		)

		Logger.debug(result)

		return result
	}

	async deleteUnexpectedOrder(orderCode: string) {
		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			const rs1 = await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(PMInventoryEntity)
				.where({ mo_no: orderCode })
				.execute()

			console.log(rs1)
			await queryRunner.manager.query(
				/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
						SELECT EPC_Code as epc FROM DV_DATA_LAKE.dbo.dv_RFIDrecordmst
						WHERE mo_no = @0
					)`,
				[orderCode]
			)
			// await Promise.all([
			// ])

			await queryRunner.commitTransaction()
		} catch {
			queryRunner.rollbackTransaction()
			Logger.error('Failed to delete unexpected order')
		} finally {
			await queryRunner.release()
		}
	}
}
