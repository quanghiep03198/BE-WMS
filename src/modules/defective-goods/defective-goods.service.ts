import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { DefectiveGoodEntity } from './entities/defective-goods.entity'

@Injectable()
export class DefectiveGoodsService extends BaseAbstractService<DefectiveGoodEntity> {
	constructor(
		@InjectRepository(DefectiveGoodEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodRepository: Repository<DefectiveGoodEntity>
	) {
		super(defectiveGoodRepository)
	}
}
