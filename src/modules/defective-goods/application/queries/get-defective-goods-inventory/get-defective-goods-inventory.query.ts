import { Query } from '@nestjs/cqrs'
import { IDefectiveGoodsReport } from '../../ports/defective-goods-report.repository.port'

export class GetDefectiveGoodsInventoryQuery extends Query<IDefectiveGoodsReport[]> {}
