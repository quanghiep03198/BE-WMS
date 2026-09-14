import { StockFlow } from '@modules/finished-goods/domain/types'
import { RollbackInboundTxCommand } from './rollback-inbound-tx.command'
import { RollbackOutboundTxCommand } from './rollback-outbound-tx.command'

export class RollbackStockCommandFactory {
	public static create(stockFlow: StockFlow, transactionId: string) {
		const commandMap: Map<StockFlow, RollbackInboundTxCommand | RollbackOutboundTxCommand> = new Map([
			['inbound', new RollbackInboundTxCommand(transactionId)],
			['outbound', new RollbackOutboundTxCommand(transactionId)]
		])

		console.log('stockFlow', stockFlow)

		return commandMap.get(stockFlow)
	}
}
