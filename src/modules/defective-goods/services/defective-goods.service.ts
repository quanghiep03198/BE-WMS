import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { chunk, omit } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { And, Between, DataSource, Equal, FindOptionsWhere, In, IsNull, Like, Not, Repository } from 'typeorm'
import { BaseAbstractService } from '../../_base/base.abstract.service'
import { FALLBACK_VALUE } from '../../rfid/constants'
import { FALLBACK_PURCHASE_ORDER } from '../constants'
import { DeleteManyDefectiveGoodsDTO } from '../dto/defective-goods.dto'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsService extends BaseAbstractService<DefectiveGoodsEntity> {
	constructor(
		@InjectPinoLogger(DefectiveGoodsService.name) private readonly logger: PinoLogger,
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodRepository: Repository<DefectiveGoodsEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSource: DataSource
	) {
		super(defectiveGoodRepository)
	}

	public async getCanInoutboundEpcs(
		type: 'inbound' | 'outbound',
		filters: Partial<DefectiveGoodsEntity> & { take?: number }
	) {
		const filterQueries: FindOptionsWhere<DefectiveGoodsEntity> = {}
		for (const [key, value] of Object.entries(omit(filters, ['take', 'action']))) {
			if (value !== undefined && value !== null) {
				filterQueries[key] = Like(`%${value}%`)
			}
		}

		return await this.defectiveGoodRepository.find({
			select: [
				'epc',
				'brand_name',
				'defective_category',
				'po',
				'mo_no',
				'factory_shoes_style',
				'cust_shoes_style',
				'color_sn',
				'size_code',
				'unit',
				'inbound_date'
			],
			where: {
				...(type === 'inbound' && {
					inbound_date: IsNull(),
					storage_location: IsNull()
				}),
				...(type === 'outbound' && {
					inbound_date: Not(IsNull()),
					storage_location: Not(IsNull())
				}),
				outbound_date: IsNull(),
				outbound_purpose: IsNull(),
				ri_cancel: false,
				is_active: true,
				ri_type: Equal('manually'),
				...omit(filterQueries, ['take'])
			},
			order: {
				epc: 'ASC'
			},
			...(!isNaN(+filters.take) && { take: +filters.take })
		})
	}

	public async checkActiveEpcsExist(epcs: string | string[]): Promise<boolean> {
		return await this.defectiveGoodRepository.existsBy({
			epc: In(Array.isArray(epcs) ? epcs : [epcs]),
			ri_cancel: false,
			is_active: true
		})
	}

	public async batchInsert(epcs: Partial<DefectiveGoodsEntity>[]) {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.connect()
		try {
			await queryRunner.startTransaction()
			await Promise.all(
				chunk(epcs, 100).map((batch) => {
					return this.dataSource.getRepository(DefectiveGoodsEntity).insert(
						batch.map((item) => {
							item.mo_no ||= null
							item.po ||= FALLBACK_PURCHASE_ORDER
							return item
						})
					)
				})
			)
			await queryRunner.commitTransaction()
		} catch (error) {
			this.logger.error('Failed to batch insert defective goods', error)
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw error
		} finally {
			if (!queryRunner.isReleased) await queryRunner.release()
		}
	}

	public async retrieveSizeQty(epcList: string[]) {
		const data = await this.defectiveGoodRepository.find({
			select: ['factory_shoes_style', 'color_sn', 'size_code', 'epc'],
			where: {
				epc: In(epcList),
				ri_cancel: false,
				is_active: true,
				ri_type: Not(Equal('manually'))
			}
		})

		const unknownEpcs = epcList.filter((item) => !data.some((d) => d.epc === item))

		const groupedData = new Map<string, Map<string, number>>()

		data.forEach((item) => {
			const groupKey = `${item.factory_shoes_style}/${item.color_sn}`
			const sizeKey = item.size_code

			if (!groupedData.has(groupKey)) {
				groupedData.set(groupKey, new Map<string, number>())
			}

			const sizeMap = groupedData.get(groupKey)!
			sizeMap.set(sizeKey, (sizeMap.get(sizeKey) || 0) + 1)
		})

		const result = Array.from(groupedData.entries()).map(([group, sizes]) => {
			const [factory_shoes_style, color_sn] = group.split('/')
			return {
				factory_shoes_style,
				color_sn,
				sizes: Array.from(sizes.entries()).map(([size_code, qty]) => ({
					size_code,
					qty
				}))
			}
		})

		if (unknownEpcs.length > 0)
			result.push({
				factory_shoes_style: FALLBACK_VALUE,
				color_sn: FALLBACK_VALUE,
				sizes: [{ size_code: FALLBACK_VALUE, qty: unknownEpcs.length }]
			})

		return result
	}

	public async deleteMany(payload: Partial<DeleteManyDefectiveGoodsDTO>) {
		const filterQuery: FindOptionsWhere<DefectiveGoodsEntity> = {
			...omit(payload, ['including_ids', 'excluding_ids', 'created']),
			...(payload.created && {
				created: Between(
					new Date(new Date(payload.created).setHours(0, 0, 0, 0)),
					new Date(new Date(payload.created).setHours(23, 59, 59, 999))
				)
			}),
			...(Array.isArray(payload.excluding_ids) &&
				payload.excluding_ids.length > 0 && { id: Not(In(payload.excluding_ids)) })
		}

		if (payload.including_ids === 'all') {
			return await this.defectiveGoodRepository.update({ ...filterQuery }, { ri_cancel: true, is_active: false })
		} else if (Array.isArray(payload.including_ids) && Array.isArray(payload.excluding_ids))
			return await this.defectiveGoodRepository.update(
				{
					...filterQuery,
					id: And(In(payload.including_ids), Not(In(payload.excluding_ids)))
				},
				{ ri_cancel: true, is_active: false }
			)
		else throw new BadGatewayException('Invalid request payload')
	}
}
