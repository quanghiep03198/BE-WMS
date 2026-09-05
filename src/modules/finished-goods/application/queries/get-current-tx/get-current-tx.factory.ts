import { StockFlow } from '@modules/finished-goods/domain/types'
import { GetCurrentShippingTxQuery } from './impl/get-current-shipping-tx.query'
import { GetCurrentStockTxQuery } from './impl/get-current-stock-tx.query'

export class GetCurrentTxQueryFactory {
	static create(stockFlow: StockFlow) {
		const queryMap: Map<StockFlow, GetCurrentStockTxQuery | GetCurrentShippingTxQuery> = new Map([
			['inbound', new GetCurrentStockTxQuery()],
			['outbound', new GetCurrentShippingTxQuery()]
		])

		return queryMap.get(stockFlow)
	}
}
