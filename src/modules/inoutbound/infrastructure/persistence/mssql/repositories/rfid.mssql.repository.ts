import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EXCLUDED_ORDERS } from '@/modules/inoutbound/domain/constants'
import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { IInoutboundMssqlRepository } from '@/modules/inoutbound/domain/repositories/rfid.repository.interface'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Brackets, DataSource } from 'typeorm'

@Injectable()
export class RFIDMssqlRepository implements IInoutboundMssqlRepository {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource) {}

	public async getEPCInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]> {
		if (!epcs.length) return []

		const generatedValues = epcs.map((e) => `('${e.getProductCode()}')`).join(',')

		const rawData = await this.dataSourceDL
			.createQueryBuilder()
			.select([
				'a.epc AS epc',
				'b.mo_no AS mo_no',
				'b.shoestyle_codefactory AS factory_shoes_style',
				'b.color_sn AS color_sn',
				'b.size_numcode AS size_numcode',
				'b.factory_code_produce AS factory_code_produce'
			])
			.from(/* SQL */ `(VALUES ${generatedValues})`, 'a(epc)')
			.leftJoin('dv_rfidmatchmst_cust', 'b', /* SQL */ `a.epc = b.epc`)
			.where(/* SQL */ `LEN(a.epc) = 24`)
			.andWhere(
				new Brackets((qb) =>
					qb.where(/* SQL */ ` b.mo_no IS NULL `).orWhere(/* SQL */ `b.mo_no NOT IN (:...excludedCommandNumbers)`)
				)
			)
			.setParameter('excludedCommandNumbers', EXCLUDED_ORDERS)
			.disableEscaping()
			.getRawMany<{
				epc: string
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				factory_code_produce: string
			}>()

		console.log('rawData', rawData)

		return rawData.map(
			(item) =>
				new ElectronicProductCode(
					item.epc,
					undefined,
					item.mo_no,
					item.factory_shoes_style,
					item.color_sn,
					item.size_numcode,
					item.factory_code_produce
				)
		)
	}
}
