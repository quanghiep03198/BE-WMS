import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@databases/constants'
import { IIoMssqlRepository } from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { EXCLUDED_ORDERS, InventoryActions } from '@modules/finished-goods/domain/constants'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { chunk } from 'lodash'
import { Brackets, DataSource, In } from 'typeorm'
import { StationNO } from '../../../../domain/utils'
import { RFIDInventoryBackupEntity, RFIDInventoryEntity } from '../entities/rfid-inventory.entity'
import { RFIDMatchEntity } from '../entities/rfid-match.entity'
import moInboundProgressQuery from '../sql/mo-inbound-progress.sql'
import poOutboundProgressQuery from '../sql/po-outbound-progess.sql'
import upsertEpcsMatchQuery from '../sql/upsert-epcs-match.sql'
import upsertInboundQuery from '../sql/upsert-inbound.sql'
import upsertOutboundQuery from '../sql/upsert-outbound.sql'

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

	public async getMoInboundProgress(manufacturingOrder: string, pendingInboundEpcs: ElectronicProductCode[]) {
		const queryResult = await this.dataSourceDL.query<
			Array<{
				size_numcode: string
				size_qty: number
				accumulated_qty: number
			}>
		>(moInboundProgressQuery, [
			manufacturingOrder,
			JSON.stringify(pendingInboundEpcs.map((e) => ({ epc: e.getStockKeepingUnit(), size_numcode: e.getSize() })))
		])

		return queryResult.map((record) => ({ ...record, size_numcode: new SizeNumber(record.size_numcode) }))
	}

	public async getPoOutboundProgress(purchaseOrder: string, pendingOutboundEpcs: ElectronicProductCode[]) {
		const queryResult = await this.dataSourceDL.query<
			Array<{
				size_numcode: string
				order_qty: number
				accumulated_qty: number
			}>
		>(poOutboundProgressQuery, [
			purchaseOrder,
			JSON.stringify(pendingOutboundEpcs.map((e) => ({ epc: e.getStockKeepingUnit(), size_numcode: e.getSize() })))
		])

		return queryResult.map((record) => ({ ...record, size_numcode: new SizeNumber(record.size_numcode) }))
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async commitStockVariation(
		data: Array<
			Array<{
				epc: string
				mo_no: string
				size_numcode: string
				factory_code: string
				dept_code: string
				dept_name: string
				storage: string
				station_no: StationNO
			}>
		>
	): Promise<void> {
		await Promise.all(
			data.map(async (payload) => await this.txHostDL.tx.query(upsertInboundQuery, [JSON.stringify(payload)]))
		)
	}

	@Transactional<TransactionalAdapterTypeOrm>(DATA_SOURCE_DATA_LAKE)
	public async commitStockOut(
		data: Array<
			Array<{
				epc: string
				mo_no: string
				size_numcode: string
				factory_code: string
				status: string
				inventory_variation_type: string
				station_no: StationNO
			}>
		>
	): Promise<void> {
		await Promise.all(
			data.map(async (payload) => await this.txHostDL.tx.query(upsertOutboundQuery, [JSON.stringify(payload)]))
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
	public async upsertEpcsMatch(payload: UpsertEpcsMatchData): Promise<void> {
		await Promise.all(
			chunk(payload, 100).map(async (data) => {
				const upsertSourceData = data.map((item) => ({
					...item,
					cust_shoes_style: item.cust_shoes_style?.replace('/', '\/'),
					factory_code_orders: item.factory_code_produce,
					factory_name_orders: item.factory_code_produce,
					factory_code_produce: item.factory_code_produce,
					factory_name_produce: item.factory_code_produce
				}))

				await this.txHostDL.tx.query(upsertEpcsMatchQuery, [JSON.stringify(upsertSourceData)])
			})
		)

		// this.eventBus.publish(new UpsertedEpcsMatchEvent(payload))
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
