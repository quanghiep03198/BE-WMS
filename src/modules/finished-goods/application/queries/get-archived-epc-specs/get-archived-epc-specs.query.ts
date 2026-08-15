import { Query } from '@nestjs/cqrs'

export class GetDeletedEpcSpecsQuery extends Query<
	Array<{
		factory_shoes_style: string
		colorways: Array<{
			color_sn: string
			batches: Array<{ mo_no: string; sizes: Array<string> }>
		}>
	}>
> {
	constructor() {
		super()
	}
}
