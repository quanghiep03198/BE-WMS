import {
	InventoryEpc,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { DeleteScanningEpcsCommand } from './delete-scanning-epcs.command'

@CommandHandler(DeleteScanningEpcsCommand)
export class DeleteScanningEpcsHandler implements ICommandHandler<DeleteScanningEpcsCommand> {
	constructor(@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel) {}

	public async execute({ scanningEpcs, rescannable }: DeleteScanningEpcsCommand) {
		await this.inventoryEpcModel
			.updateMany({ epc: { $in: scanningEpcs } }, { deleted: true, scannable: rescannable })
			.exec()
	}
}
