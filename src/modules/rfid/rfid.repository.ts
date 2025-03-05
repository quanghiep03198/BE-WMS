import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { readFileSync } from 'fs'
import { chunk, groupBy, pick } from 'lodash'
import { AnyBulkWriteOperation, PaginateModel } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import { TenancyService } from '../tenancy/tenancy.service'
import { EXCLUDED_ORDERS } from './constants'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { Epc, EpcDocument } from './schemas/epc.schema'
import { CustomerOrderSizeDetail } from './types'
/**
 * @description Repository for Finished Production Inventory (FPI)
 */
@Injectable()
export class FPIRespository {
	private readonly orderDetailByEpcsQuery: string = readFileSync(resolve(join(__dirname, './sql/order-detail.sql')), {
		encoding: 'utf-8'
	})

	private readonly upsertEpcsQuery: string = readFileSync(resolve(join(__dirname, './sql/upsert-rfid-match.sql')), {
		encoding: 'utf-8'
	})

	constructor(
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource,
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
		private readonly tenancyService: TenancyService,
		private readonly configService: ConfigService
	) {}

	/**
	 * @description Get manufacturing order sizes by EPCs
	 */
	async getOrderDetailByEpcs(epcs: Record<'epc' | 'mo_no', string>[]) {
		const result = await this.dataSource.query<Array<CustomerOrderSizeDetail>>(this.orderDetailByEpcsQuery, [
			epcs.map((item) => item.epc).join(','),
			EXCLUDED_ORDERS.join(',')
		])
		return Object.entries(groupBy(result, 'mo_no')).map(([order, sizes]) => ({
			mo_no: order,
			mat_code: sizes[0].mat_code,
			shoes_style_code_factory: sizes[0].shoes_style_code_factory,
			sizes: sizes.map((size) => ({
				size_numcode: size.size_numcode,
				count: size.count
			}))
		}))
	}

	async upsertBulk(tenantId: string, payload: Partial<RFIDMatchCustomerEntity>[]): Promise<void> {
		const tenant = this.tenancyService.findOneById(tenantId)
		const dataSource = new DataSource({
			...this.configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
			host: tenant.host,
			database: DATABASE_DATA_LAKE,
			entities: [RFIDMatchCustomerEntity]
		})
		if (!dataSource.isInitialized) await dataSource.initialize()
		const session = await this.epcModel.startSession()
		const queryRunner = dataSource.createQueryRunner()
		await queryRunner.connect()
		try {
			await Promise.all([session.startTransaction(), queryRunner.startTransaction()])

			for (const data of chunk(payload, 2000)) {
				const values = data
					.map((item) => {
						return `(
							'${item.epc}', '${item.mo_no}', '${item.mat_code}', '${item.mo_noseq}', '${item.or_no}', '${item.or_cust_po}', 
							'${item.shoes_style_code_factory}', '${item.cust_shoes_style.replace('/', '\/')}', '${item.size_code}', '${item.size_numcode}',
							'${item.factory_code_orders}', '${item.factory_name_orders}', '${item.factory_code_produce}', '${item.factory_name_produce}', ${item.size_qty || 1},
							'${item.remark ?? ''}'
						)`
					})
					.join(',')
				await queryRunner.query(this.upsertEpcsQuery.replace(':values', values))
			}
			const bulkWriteOptions: AnyBulkWriteOperation<any>[] = payload.map((item) => ({
				updateOne: {
					filter: { epc: item.epc },
					update: {
						$set: pick(item, ['mo_no', 'mat_code', 'shoes_style_code_factory', 'size_numcode'])
					}
				}
			}))
			await this.epcModel.bulkWrite(bulkWriteOptions)
			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (error) {
			FileLogger.error(error)
			await Promise.all([session.abortTransaction(), queryRunner.rollbackTransaction()])
			throw new Error(error)
		} finally {
			await queryRunner.release()
		}
	}
}
