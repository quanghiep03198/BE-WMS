import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { IMssqlFinishedGoodsRepository } from '@modules/finished-goods/application/ports/mssql-finished-goods.repository.port'
import { UpsertEpcsMatchData } from '@modules/finished-goods/domain/types'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm'
import { Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { chunk } from 'lodash'
import { In } from 'typeorm'
import { StationNO } from '../../../../domain/utils'
import { RFIDMatchEntity } from '../entities/rfid-match.entity'
import upsertEpcsMatchQuery from '../sql/upsert-epcs-match.sql'
import upsertInboundQuery from '../sql/upsert-inbound.sql'
import upsertOutboundQuery from '../sql/upsert-outbound.sql'

@Injectable()
export class MssqlFinishedGoodsRepository implements IMssqlFinishedGoodsRepository {
	constructor(
		@InjectTransactionHost(DATA_SOURCE_DATA_LAKE)
		private readonly txHostDL: TransactionHost<TransactionalAdapterTypeOrm>
	) {}

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
	public async upsertEpcsMatch(payload: UpsertEpcsMatchData, insertOnly: boolean = true): Promise<void> {
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

				await this.txHostDL.tx.query(upsertEpcsMatchQuery, [JSON.stringify(upsertSourceData), insertOnly ? 1 : 0])
			})
		)

		// this.eventBus.publish(new UpsertedEpcsMatchEvent(payload))
	}
}
