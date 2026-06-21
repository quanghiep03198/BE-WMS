import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { EXCLUDED_ORDERS, InventoryActions } from '@/modules/inoutbound/domain/constants'
import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import { IInoutboundMssqlRepository } from '@/modules/inoutbound/domain/repositories/io-mssql.repository.interface'
import { UpsertStockInDTO } from '@/modules/inoutbound/presentation/dto/rfid-inbound.dto'
import { Transactional } from '@nestjs-cls/transactional'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { chunk, omit } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Brackets, DataSource } from 'typeorm'
import { generateStation } from '../../../utils'
import { RFIDInventoryBackupEntity, RFIDInventoryEntity } from '../entities/rfid-inventory.entity'

@Injectable()
export class InoutboundMssqlRepository implements IInoutboundMssqlRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectPinoLogger(InoutboundMssqlRepository.name) private readonly logger: PinoLogger
	) {}

	public async getEpcsInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]> {
		if (!epcs.length) return []

		const generatedValues = epcs.map((e) => `('${e.getStockKeepingUnit()}')`).join(',')

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

	public async getExcessInboundQuantities(
		manufacturingOrder: string,
		epcs: ElectronicProductCode[]
	): Promise<
		Array<{
			size_numcode: string
			missing_qty: number
		}>
	> {
		const sql: string = readFileSync(resolve(join(__dirname, '../../../sql/mo-inbound-progress.sql')), 'utf-8')

		const missingOrderSizeQty = await this.dataSourceDL.query<
			Array<{
				size_numcode: string
				missing_qty: number
			}>
		>(sql, [
			manufacturingOrder,
			JSON.stringify(epcs.map((e) => ({ epc: e.getStockKeepingUnit(), size_numcode: e.getSize() })))
		])

		return missingOrderSizeQty.filter((size) => size.missing_qty < 0)
	}

	@Transactional()
	public async stockIn(epcs: Array<ElectronicProductCode>, stockInDetails: UpsertStockInDTO): Promise<void> {
		const sql: string = readFileSync(resolve(join(__dirname, '../../../sql/upsert-inbound.sql')), 'utf-8')

		const upsertPayload = epcs
			.filter((item) => item.getIsWritable() && !item.getIsInternal())
			.map((item) => {
				return {
					...omit(stockInDetails, ['mo_no', 'inbound_device_sn']),
					epc: item.getStockKeepingUnit(),
					mo_no: item.getManufacturingOrder(),
					size_numcode: item.getSize(),
					factory_code: item.getFactoryProduce(),
					station_no: generateStation(item.getFactoryProduce(), 'WH101'),
					record_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
				}
			})

		await Promise.all(
			chunk(upsertPayload, 100).map(async (item) => {
				return await this.dataSourceDL.query(sql, [JSON.stringify(item)])
			})
		)
	}

	@Transactional()
	public async rollbackStoredEpcs(stationNO: 'WH101' | 'WH103', epcs: Array<ElectronicProductCode>): Promise<void> {
		await this.dataSourceDL
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder()
			.delete()
			.where('epc IN (:...epcs)', { epcs: epcs.map((item) => item.getStockKeepingUnit()) })
			.andWhere('RIGHT(stationNO, 5) = :station_no', { station_no: stationNO })
			.andWhere('rfid_status = :rfid_status', { rfid_status: InventoryActions.INBOUND })
			.andWhere('CAST(record_time AS DATE) = CAST(GETDATE() AS DATE)')
			.execute()

		await this.dataSourceDL
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder()
			.delete()
			.where('epc IN (:...epcs)', { epcs: epcs.map((item) => item.getStockKeepingUnit()) })
			.andWhere('RIGHT(stationNO, 5) = :station_no', { station_no: stationNO })
			.andWhere('rfid_status = :rfid_status', { rfid_status: InventoryActions.INBOUND })
			.andWhere('CAST(record_time AS DATE) = CAST(GETDATE() AS DATE)')
			.execute()
	}
}
