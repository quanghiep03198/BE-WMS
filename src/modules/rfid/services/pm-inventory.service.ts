import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Injectable, Logger } from '@nestjs/common'
import { groupBy, isNil, uniqBy } from 'lodash'
import { In, IsNull, Like, Or } from 'typeorm'
import { InventoryActions } from '../constants'
import { DeleteOrderDTO, UpdateStockDTO } from '../dto/pm-inventory.dto'
import { PMInventoryEntity } from '../entities/pm-inventory.entity'
import { RFIDPMEntity } from '../entities/rfid-pm.entity'

interface BaseFetchDataArgs {
	factoryCode: string
	producingProcess: string
}

interface FetchLatestDataArgs extends BaseFetchDataArgs {
	page: number
}

interface FetchLatestDataArgs extends BaseFetchDataArgs {
	page: number
}

@Injectable()
export class PMInventoryService {
	private readonly LIMIT_FETCH_DOCS = 50

	constructor(private readonly tenancyService: TenancyService) {}

	async fetchLastestDataByProcess(args: FetchLatestDataArgs) {
		const stationNoPattern = `%${args.factoryCode}_${args.producingProcess}%`
		const [[epcs, totalDocs], sizes] = await Promise.all([
			this.tenancyService.dataSource.getRepository(PMInventoryEntity).findAndCount({
				select: ['epc', 'mo_no'],
				where: {
					rfid_status: IsNull(),
					station_no: Like(stationNoPattern)
					// record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd'))
				},
				take: this.LIMIT_FETCH_DOCS,
				skip: (args.page ?? 1 - 1) * this.LIMIT_FETCH_DOCS,
				order: { mo_no: 'ASC' }
			}),
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

		return await this.tenancyService.dataSource.getRepository(PMInventoryEntity).update(
			{
				mo_no: hasSomeUnknownOrder ? Or(IsNull(), In(filteredPayload)) : In(filteredPayload),
				rfid_status: IsNull()
			},
			{ rfid_status: InventoryActions.INBOUND }
		)
	}

	async deleteUnexpectedOrder(args: DeleteOrderDTO & { factoryCode: string }) {
		const stationNoPattern = `%${args.factoryCode}_${args.process}%`

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			await Promise.all([
				queryRunner.manager
					.createQueryBuilder()
					.delete()
					.from(PMInventoryEntity)
					.where({ mo_no: args.order !== 'null' ? args.order : IsNull() })
					.andWhere({ station_no: Like(stationNoPattern) })
					.execute(),
				queryRunner.manager.query(
					/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
								SELECT EPC_Code as epc FROM DV_DATA_LAKE.dbo.dv_RFIDrecordmst
								WHERE mo_no = @0
								AND stationNO LIKE @1
							)`,
					[args.order, stationNoPattern]
				)
			])

			await queryRunner.commitTransaction()
		} catch (e) {
			queryRunner.rollbackTransaction()
			Logger.error(e)
		} finally {
			await queryRunner.release()
		}

		const totalDocsAfterDelete = await this.tenancyService.dataSource.getRepository(PMInventoryEntity).countBy({
			rfid_status: IsNull(),
			station_no: Like(stationNoPattern)
		})

		const totalPagesAfterDelete = Math.ceil(totalDocsAfterDelete / this.LIMIT_FETCH_DOCS)

		return { totalDocs: totalDocsAfterDelete, totalPages: totalPagesAfterDelete }
	}
}
