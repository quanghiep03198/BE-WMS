import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource, In, Repository } from 'typeorm'
import { ImportOrderDetEntity } from '../entities/import-order-det.entity'
import { ImportOrderEntity } from '../entities/import-order-mst.entity'
import { TransferOrderDetailEntity } from '../entities/transfer-order-detail.entity'

@Injectable()
export class ImportOrderService {
	constructor(
		@InjectRepository(ImportOrderEntity, DATA_SOURCE_DATA_LAKE)
		private readonly ImportOrderRepository: Repository<ImportOrderEntity>,
		@InjectRepository(ImportOrderDetEntity, DATA_SOURCE_DATA_LAKE)
		private readonly ImportOrderDetRepository: Repository<ImportOrderDetEntity>,
		@InjectRepository(TransferOrderDetailEntity, DATA_SOURCE_DATA_LAKE)
		@InjectDataSource(DATA_SOURCE_ERP)
		private readonly dataSourceERP: DataSource,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource
	) {}

	async getOneRow(orNo: string): Promise<any> {
		const sql = readFileSync(join(__dirname, '../sql/one-row.sql'), 'utf-8')
		const result = await this.dataSourceERP.query(sql, [orNo])
		return result[0] || null
	}

	async getImportOrderByFactory(companyCode: string) {
		return this.ImportOrderRepository.createQueryBuilder('whiomst')
			.where('whiomst.cofactory_code = :companyCode', { companyCode })
			.getMany()
	}

	async getDataImport(companyCode: string) {
		const query = readFileSync(join(__dirname, '../sql/data-import.sql'), 'utf-8').toString()
		return await this.dataSourceERP.query(query, [companyCode])
	}

	async store(companyCode: string, payload: any) {
		const ProductionImportPayload = payload.map((item) => {
			return {
				...item,
				cofactory_code: companyCode,
				sno_date: new Date().toISOString(),
				dept_name: 'test_dept',
				sno_no: 'SNA' + Date.now().toString().slice(-7),
				type_inventorylist: 'AAA',
				dept_code: 'test_code' + Date.now().toString().slice(-4),
				warehouse_code: 'test132',
				warehouse_name: 'test133'
			}
		})

		const createdSnoNos = []

		for (const payloadItem of ProductionImportPayload) {
			const snoExists = await this.ImportOrderRepository.findOne({
				where: { sno_no: payloadItem.sno_no }
			})

			if (!snoExists) {
				const savedItem = await this.ImportOrderRepository.save(payloadItem)
				createdSnoNos.push(savedItem.sno_no)
			}
		}

		const ProductionImportPayloadDetail = await Promise.all(
			payload.map(async (item) => {
				const result = await this.getOneRow(item.or_no)
				return {
					custbrand_id: result.custbrand_id,
					mo_templink: result.mo_templink,
					mo_no: result.mo_no,
					sno_boxqty: item.sno_boxqty ?? 0,
					sno_qty: item.sno_qty ?? 0,
					sno_no: createdSnoNos[0],
					sno_templink: 'test' + Date.now().toString().slice(-4)
				}
			})
		)

		const snoNos = ProductionImportPayload.map((p) => p.sno_no).filter(Boolean)
		if (snoNos.length === 0) {
			throw new Error('không tìm thấy trường sno_nno hợp lệ trong payload')
		}

		const snoNosAsBigInt = snoNos.map((sno) => parseInt(sno, 10)).filter((sno) => !isNaN(sno))

		const existingOrNos = await this.ImportOrderRepository.createQueryBuilder('whiomst')
			.select('whiomst.sno_no')
			.whereInIds(snoNosAsBigInt)
			.getMany()

		if (existingOrNos.length > 0) {
			const existingOrNosList = existingOrNos.map((record) => record.sno_no).join(', ')
			throw new ConflictException(existingOrNosList)
		}

		// Transaction
		const createdTransferOrders = []
		await this.dataSourceERP.manager.transaction(async (manager) => {
			for (const detailPayload of ProductionImportPayloadDetail) {
				await manager.getRepository(ImportOrderDetEntity).save(detailPayload)
			}
		})
	}

	async deleteImportData(sno_no: string[]): Promise<any> {
		const queryRunner = this.dataSourceDL.createQueryRunner()

		await queryRunner.connect()
		await queryRunner.startTransaction()

		try {
			await queryRunner.manager.delete(ImportOrderDetEntity, {
				sno_no: In(sno_no)
			})

			await queryRunner.manager.delete(ImportOrderEntity, {
				sno_no: In(sno_no)
			})

			await queryRunner.commitTransaction()
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw error
		} finally {
			await queryRunner.release()
		}
	}
}
