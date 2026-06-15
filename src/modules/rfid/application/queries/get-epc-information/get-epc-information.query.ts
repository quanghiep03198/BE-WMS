import { ElectronicProductCode } from '@/modules/rfid/domain/entities/epc.entity'
import { PostReaderDataDTO } from '@/modules/rfid/infrastructure/dto/rfid-shared.dto'
import { IQuery } from '@nestjs/cqrs'

export class GetEpcInformationQuery implements IQuery {
	public readonly data: ElectronicProductCode[]

	constructor(public readonly payload: PostReaderDataDTO['data']) {
		this.data = payload.tagList
			.map((tag) => new ElectronicProductCode(tag.epc.trim()))
			.filter((item) => item.getIsWritable())
	}
}
