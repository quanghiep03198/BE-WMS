import { SuperJson } from '@common/utils'
import { DATA_SOURCE_ERP } from '@databases/constants'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
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
					sizes: SuperJson.parse<Array<SizeRun>>(record.sizes).map((size) => ({
						size_numcode: new SizeNumber(size.size_numcode).normalize('padleft'),
						size_qty: size.size_qty
					}))
				}))
			)

		return result
	}
}
