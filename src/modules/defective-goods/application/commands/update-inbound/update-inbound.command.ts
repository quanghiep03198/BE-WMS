import { UpdateInboundStatusDTO } from '../../dto/inoutbound.dto'

export class UpdateInboundCommand {
	constructor(public readonly data: UpdateInboundStatusDTO, public readonly userId: TObjectId, public readonly username: string) {}
}
