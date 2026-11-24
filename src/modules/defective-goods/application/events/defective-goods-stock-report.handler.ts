import { Injectable } from '@nestjs/common'
import { DefectiveGoodsStockedInEvent, DefectiveGoodsStockedOutEvent } from '../../domain/events/defective-goods.events'
import { DefectiveGoodsDomainModel } from '../../domain/models/defective-goods.model'
import { IDefectiveGoodsStockTransaction } from '../ports/defective-goods-stock-unit-of-work.port'

@Injectable()
export class DefectiveGoodsStockReportHandler {
	async handle(models: DefectiveGoodsDomainModel[], transaction: IDefectiveGoodsStockTransaction) {
		const events = models.flatMap((model) =>
			model
				.getUncommittedEvents()
				.filter(
					(event): event is DefectiveGoodsStockedInEvent | DefectiveGoodsStockedOutEvent =>
						event instanceof DefectiveGoodsStockedInEvent || event instanceof DefectiveGoodsStockedOutEvent
				)
		)
		await transaction.mergeStockEvents(events)
	}
}
