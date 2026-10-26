import { UpdateOutboundStatusDTO } from '../../dto/inoutbound.dto'

export class UpdateOutboundCommand {
	constructor(public readonly data: UpdateOutboundStatusDTO, public readonly userId: TObjectId, public readonly username: string) {}
}
