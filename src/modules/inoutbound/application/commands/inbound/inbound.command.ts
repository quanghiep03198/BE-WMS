import { UpsertStockInDTO } from '@/modules/inoutbound/presentation/dto/rfid-inbound.dto'
import { ICommand } from '@nestjs/cqrs'

export class InboundCommand implements ICommand {
	constructor(public readonly request: UpsertStockInDTO & { mo_no: string; factory_code_produce: string }) {}
}
