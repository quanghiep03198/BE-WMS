import {
	EpcChangeStreamFilterQuery,
	IEpcChangeStream
} from '@modules/finished-goods/domain/interfaces/epc-change-stream.interface'
import { Command } from '@nestjs/cqrs'

export class CreateEpcChangeStreamCommand extends Command<IEpcChangeStream> {
	constructor(
		public readonly filterQuery: EpcChangeStreamFilterQuery,
		public readonly onChange: () => void | Promise<void>
	) {
		super()
	}
}
