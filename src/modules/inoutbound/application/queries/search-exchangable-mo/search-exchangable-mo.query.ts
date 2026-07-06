import { Query } from '@nestjs/cqrs'

export class SearchExchangableMoQuery extends Query<Array<{ mo_no: string; created: Date }>> {
	constructor(
		public readonly searchTerm: string,
		public readonly factoryCode: string,
		public readonly color: string
	) {
		super()
	}
}
