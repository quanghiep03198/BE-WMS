import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import {
	IInoutboundMongoRepository,
	INOUTBOUND_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/inventory-epc.repository.interface'
import {
	IInoutboundMssqlRepository,
	INOUTBOUND_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/rfid.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@Inject(INOUTBOUND_MSSQL_REPOSITORY) private readonly rfidRepository: IInoutboundMssqlRepository,
		@Inject(INOUTBOUND_MONGO_REPOSITORY) private readonly inventoryEpcRepository: IInoutboundMongoRepository
	) {}

	public async execute({ request }: BulkWriteInventoryCommand) {
		const { data, sn } = request.payload

		const epcs = ElectronicProductCode.createFactory(data.tagList!)

		const scannedEpcs = await this.rfidRepository.getEPCInformation(epcs)

		if (scannedEpcs.length === 0) return

		console.log('request.action', request.action)

		await this.inventoryEpcRepository.bulkWriteInventoryEPCs({
			action: request.action,
			payload: {
				eProductCodes: scannedEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
