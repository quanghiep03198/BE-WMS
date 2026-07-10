import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@databases/constants'
import { IIoMssqlRepository } from '@modules/inoutbound/application/ports/io-mssql.repository.port'
import { EXCLUDED_ORDERS, InventoryActions } from '@modules/inoutbound/domain/constants'
import { ElectronicProductCode } from '@modules/inoutbound/domain/value-objects/epc.vo'
import { SizeNumber } from '@modules/inoutbound/domain/value-objects/size-number.vo'
import { StockInDTO } from '@modules/inoutbound/presentation/dto/rfid-inbound.dto'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { chunk, omit } from 'lodash'
import { Brackets, DataSource, In } from 'typeorm'
import { generateStation } from '../../../utils'
import { RFIDInventoryBackupEntity, RFIDInventoryEntity } from '../entities/rfid-inventory.entity'
import { RFIDMatchEntity } from '../entities/rfid-match.entity'
import moInboundProgressQuery from '../sql/mo-inbound-progress.sql'
import moSizeRunQuery from '../sql/mo-size-run.sql'
import upsertInboundQuery from '../sql/upsert-inbound.sql'

@Injectable()
export class InoutboundMssqlRepository implements IIoMssqlRepository {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectTransactionHost(DATA_SOURCE_DATA_LAKE)
		private readonly txHostDL: TransactionHost<TransactionalAdapterTypeOrm>
	) {}

	public async getEpcsInformation(epcs: ElectronicProductCode[]): Promise<ElectronicProductCode[]> {
		if (!epcs.length) return []

		const generatedValues = epcs
			.filter((e) => e.getIsWritable())
			.map((e) => {
				const sku = e.getStockKeepingUnit()
				return `('${sku}')`
			})
			.join(',')

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
				new ElectronicProductCode(item.epc, {
					mo_no: item.mo_no,
					factory_shoes_style: item.factory_shoes_style,
					color_sn: item.color_sn,
					size_numcode: new SizeNumber(item.size_numcode),
					factory_code_produce: item.factory_code_produce
				})
		)
	}

	public async getMoInboundProgress(
		manufacturingOrder: string,
		pendingInboundEpcs: ElectronicProductCode[]
	): Promise<
		Array<{
			size_numcode: SizeNumber
			size_qty: number
			accumulated_inbound_qty: number
		}>
	> {
		const sql: string = moInboundProgressQuery

		const queryResult = await this.dataSourceDL.query<
			Array<{
				size_numcode: string
				size_qty: number
				accumulated_inbound_qty: number
			}>
		>(sql, [
			manufacturingOrder,
			JSON.stringify(pendingInboundEpcs.map((e) => ({ epc: e.getStockKeepingUnit(), size_numcode: e.getSize() })))
		])

		return queryResult.map((record) => ({ ...record, size_numcode: new SizeNumber(record.size_numcode) }))
	}

	public async getExchangeTargetMo(
		targetMo: string,
		moSeq: string = '001'
	): Promise<{
		mo_no: string
		mo_noseq: string
		or_custpo: string
		factory_shoes_style: string
		cust_shoes_style: string
		mat_code: string
		color_sn: string
		sizes: Array<string>
	}> {
		const sql: string = moSizeRunQuery

		const [result] = await this.dataSourceERP
			.query<
				Array<{
					mo_no: string
					mo_noseq: string
					or_custpo: string
					factory_shoes_style: string
					cust_shoes_style: string
					mat_code: string
					color_sn: string
					sizes: string
				}>
			>(sql, [targetMo, moSeq])
			.then((records) =>
				records.map((record) => ({
					...record,
					sizes: JSON.parse(record.sizes) as Array<string>
				}))
			)

		return result
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async stockIn(epcs: ReadonlyArray<ElectronicProductCode>, stockInDetails: StockInDTO): Promise<void> {
		const sql: string = upsertInboundQuery

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
				return await this.txHostDL.tx.query(sql, [JSON.stringify(item)])
			})
		)
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async exchangeManufacturingOrder(exchangeSkus: Array<string>, targetMo: string): Promise<void> {
		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		await Promise.all(
			chunk(exchangeSkus, 2000).map(async (skus) => {
				return await this.txHostDL.tx.getRepository(RFIDMatchEntity).update(
					{ epc: In(skus) },
					{
						mo_no: targetMo,
						actual_mo_no: () => 'mo_no',
						remark: () => /* SQL */ `CONCAT('[${currentTimestamp}] Info: Exchanged from M.O ', '"',mo_no, '"')`
					}
				)
			})
		)
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async rollbackStockTransaction(
		stationNo: 'WH101' | 'WH103',
		epcs: Array<ElectronicProductCode>
	): Promise<void> {
		await this.txHostDL.tx
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder()
			.delete()
			.where('epc IN (:...epcs)', { epcs: epcs.map((item) => item.getStockKeepingUnit()) })
			.andWhere('RIGHT(stationNO, 5) = :station_no', { station_no: stationNo })
			.andWhere('rfid_status = :rfid_status', { rfid_status: InventoryActions.INBOUND })
			.andWhere('CAST(record_time AS DATE) = CAST(GETDATE() AS DATE)')
			.execute()

		await this.txHostDL.tx
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder()
			.delete()
			.where('epc IN (:...epcs)', { epcs: epcs.map((item) => item.getStockKeepingUnit()) })
			.andWhere('RIGHT(stationNO, 5) = :station_no', { station_no: stationNo })
			.andWhere('rfid_status = :rfid_status', { rfid_status: InventoryActions.INBOUND })
			.andWhere('CAST(record_time AS DATE) = CAST(GETDATE() AS DATE)')
			.execute()
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async rollbackExchangeMoTransaction(originalSkus: Array<string>): Promise<void> {
		await Promise.all(
			chunk(originalSkus, 2000).map(async (skus) => {
				return await this.txHostDL.tx.getRepository(RFIDMatchEntity).update(
					{ epc: In(skus) },
					{
						mo_no: () => 'mo_no_actual',
						actual_mo_no: null,
						remark: null
					}
				)
			})
		)
	}
}
