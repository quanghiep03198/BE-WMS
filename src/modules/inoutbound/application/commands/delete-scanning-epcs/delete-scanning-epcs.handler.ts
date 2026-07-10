import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DeleteScanningEpcsCommand } from './delete-scanning-epcs.command'

@CommandHandler(DeleteScanningEpcsCommand)
export class DeleteScanningEpcsHandler implements ICommandHandler<DeleteScanningEpcsCommand> {
	constructor(
		@InjectPinoLogger(DeleteScanningEpcsHandler.name) private readonly logger: PinoLogger,
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ pendingDeleteEpcs, rescannable }: DeleteScanningEpcsCommand) {
		this.logger.debug(pendingDeleteEpcs)

		await this.inventoryEpcModel
			.updateMany({ epc: { $in: pendingDeleteEpcs } }, { deleted: true, scannable: rescannable })
			.exec()
	}
}
