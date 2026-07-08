import { Query } from '@nestjs/cqrs'

export class GetArchivedEpcsQuery extends Query<any> {
	// Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	constructor(
		public readonly page: number,
		public readonly limit: number,
		public readonly searchTerm?: string,
		public readonly manufacturingOrder?: string,
		public readonly shoeStyle?: string,
		public readonly sizeNumber?: string,
		public readonly scannable?: boolean
	) {
		super()
	}
}
