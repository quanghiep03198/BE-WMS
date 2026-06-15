import { InventoryEpc, InventoryEpcModel } from '@/modules/rfid/infrastructure/persistence/mongodb/epc.schema'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'

import { ElectronicProductCode } from '@/modules/rfid/domain/entities/epc.entity'
import { RFIDRepository } from '@/modules/rfid/infrastructure/repositories/rfid.repository'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@InjectModel(InventoryEpc.name) private readonly inventoryEpcModel: InventoryEpcModel,
		private readonly rfidRepository: RFIDRepository
	) {}

	public async execute({ request }: BulkWriteInventoryCommand) {
		const { data, sn } = request.payload

		const epcs = data.tagList
			.map((tag) => new ElectronicProductCode(tag.epc.trim()))
			.filter((item) => item.getIsWritable())

		const scannedEpcs = await this.rfidRepository.getEpcInformation(epcs)
		if (scannedEpcs.length === 0) return

		await this.rfidRepository.bulkWriteInventoryEpcs(epcs, request.action, sn)
	}
}
