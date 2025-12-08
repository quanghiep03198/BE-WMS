import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { omit } from 'lodash'
import { And, Between, FindOptionsWhere, In, Not, Repository } from 'typeorm'
import { BaseAbstractService } from '../../_base/base.abstract.service'
import { FALLBACK_VALUE } from '../../rfid/constants'
import { DeleteManyDefectiveGoodsDTO } from '../dto/defective-goods.dto'
import { DefectiveGoodsEntity } from '../entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsService extends BaseAbstractService<DefectiveGoodsEntity> {
	constructor(
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodRepository: Repository<DefectiveGoodsEntity>
	) {
		super(defectiveGoodRepository)
	}

	public async checkActiveEpcsExist(epcs: string | string[]): Promise<boolean> {
		return await this.defectiveGoodRepository.existsBy({
			epc: In(Array.isArray(epcs) ? epcs : [epcs]),
			ri_cancel: false
		})
	}

	public async retrieveSizeQty(epcList: string[]) {
		const data = await this.defectiveGoodRepository.find({
			select: ['factory_shoes_style', 'color_sn', 'size_code', 'epc'],
			where: {
				epc: In(epcList),
				ri_cancel: false
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
			return await this.defectiveGoodRepository.delete({ ...filterQuery })
		} else if (Array.isArray(payload.including_ids) && Array.isArray(payload.excluding_ids))
			return await this.defectiveGoodRepository.delete({
				...filterQuery,
				id: And(In(payload.including_ids), Not(In(payload.excluding_ids)))
			})
		else throw new BadGatewayException('Invalid request payload')
	}
}
