import { IEpcChangeStream } from '@modules/finished-goods/domain/interfaces/epc-change-stream.interface'
import { FinishedGoodsEpcDocument } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { mongo } from 'mongoose'

/**
 * Wrapper for MongoDB ChangeStream that implements domain interface
 * Encapsulates infrastructure details from presentation layer
 */
export class EpcChangeStreamWrapper implements IEpcChangeStream {
	private readonly listeners: Array<() => void | Promise<void>> = []

	constructor(
		private readonly changeStream: mongo.ChangeStream<
			FinishedGoodsEpcDocument,
			mongo.ChangeStreamDocument<FinishedGoodsEpcDocument>
		>
	) {}

	onChange(handler: () => void | Promise<void>): void {
		this.listeners.push(handler)
		this.changeStream.on('change', handler)
	}

	async close(): Promise<void> {
		// Remove all registered listeners
		for (const listener of this.listeners) {
			this.changeStream.removeListener('change', listener)
		}
		this.listeners.length = 0

		// Close the underlying stream
		await this.changeStream.close()
	}
}
