import { DATA_SOURCE_ERP } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { IOrderRepository } from './order.repository.interface'
import moSizeRunQuery from './sql/mo-size-run.sql'
import { SizeRun, TManufacturingOrder } from './types'

@Injectable()
export class OrderRepository implements IOrderRepository {
	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	public async getManufacturingOrder(targetMo: string, moSeq: string = '001'): Promise<TManufacturingOrder> {
		const [result] = await this.dataSourceERP
			.query<Array<TManufacturingOrder & { sizes: string }>>(moSizeRunQuery, [targetMo, moSeq])
			.then((records) =>
				records.map((record) => ({
					...record,
					sizes: JSON.parse(record.sizes) as Array<SizeRun>
				}))
			)

		return result
	}
}
