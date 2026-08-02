import { EpcChangeStreamFilterQuery, IEpcChangeStream } from './epc-change-stream.interface'

// domain/interfaces/epc-change-stream-factory.interface.ts
export interface IEpcChangeStreamFactory {
	create(
		filterQuery: EpcChangeStreamFilterQuery, // domain-level filter, không phải Mongo $match
		onChange: () => void | Promise<void>
	): Promise<IEpcChangeStream>
}

export const MONGO_EPC_CHANGE_STREAM_FACTORY = Symbol('IEpcChangeStreamFactory')
