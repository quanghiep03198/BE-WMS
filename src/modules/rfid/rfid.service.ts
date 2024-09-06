import { Injectable } from '@nestjs/common'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource } from 'typeorm'
import { DynamicDataSourceService } from '../_shared/dynamic-datasource.service'

@Injectable()
export class RFIDService {
	private dataSource: DataSource

	constructor(protected dynamicDataSourceService: DynamicDataSourceService) {
		this.dataSource = dynamicDataSourceService._datasource
	}

	async findUnstoredEPC() {
		return await Promise.all([this.findWhereNotInStock(), this.retrieveOrderSizing(), this.getOrderQuantity()])
	}

	private async findWhereNotInStock() {
		return await this.dataSource
			.createQueryBuilder()
			.select(['DISTINCT i.EPC_Code AS epc_code', "ISNULL(ISNULL(i.mo_no_actual, i.mo_no), 'Unknown') AS mo_no"])
			.from('DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet', 'i')
			.where('rfid_status IS NULL')
			.andWhere('i.record_time >= :today', { today: new Date() })
			.andWhere('i.epc_code NOT LIKE :ignorePattern', { ignorePattern: '303429%' })
			.andWhere('i.mo_no NOT IN (:mo_no)', { mo_no: ['13D05B006'].join(',') })
			.getRawMany()
	}

	private async retrieveOrderSizing() {
		const query = readFileSync(join(__dirname, 'sql', 'size-qty.sql')).toString()
		return await this.dataSource.query(query)
	}

	private async getOrderQuantity() {
		const query = readFileSync(join(__dirname, 'sql', 'order-qty.sql'), 'utf8').toString()
		return await this.dataSource.query(query)
	}

	async updateStock(payload) {
		return await this.dataSource.manager.createQueryBuilder()
	}
}
