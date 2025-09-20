import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { omit } from 'lodash'
import { And, Between, FindOptionsWhere, In, Not, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { DeleteManyDefectiveGoodsDTO } from './dto/defective-goods.dto'
import { UpdateInboundStatusDTO, UpdateOutboundStatusDTO } from './dto/inoutbound.dto'
import { DefectiveGoodEntity } from './entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsService extends BaseAbstractService<DefectiveGoodEntity> {
	constructor(
		@InjectRepository(DefectiveGoodEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodRepository: Repository<DefectiveGoodEntity>
	) {
		super(defectiveGoodRepository)
	}

	public async retrieveSizeQty(epcList: string[]) {
		const data = await this.defectiveGoodRepository.find({
			select: ['factory_shoes_style', 'color_sn', 'size_code', 'epc'],
			where: { epc: In(epcList) }
		})

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

		return Array.from(groupedData.entries()).map(([group, sizes]) => {
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
	}

	public async updateInboundStatus(update: UpdateInboundStatusDTO) {
		return await this.defectiveGoodRepository.update({ epc: In(update.epcs) }, omit(update, ['epcs']))
	}

	public async updateOutboundStatus(update: UpdateOutboundStatusDTO) {
		return await this.defectiveGoodRepository.update({ epc: In(update.epcs) }, omit(update, ['epcs']))
	}

	public async deleteMany(payload: Partial<DeleteManyDefectiveGoodsDTO>) {
		const filterQuery: FindOptionsWhere<DefectiveGoodEntity> = {
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
