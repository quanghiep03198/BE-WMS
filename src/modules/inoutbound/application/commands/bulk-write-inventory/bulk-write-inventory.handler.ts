import { ElectronicProductCode } from '@/modules/inoutbound/domain/entities/epc.entity'
import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import {
	IInoutboundMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mssql.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { BulkWriteInventoryCommand } from './bulk-write-inventory.command'

@CommandHandler(BulkWriteInventoryCommand)
export class BulkWriteInventoryCommandHandler implements ICommandHandler<BulkWriteInventoryCommand, void> {
	constructor(
		@Inject(IO_MSSQL_REPOSITORY) private readonly rfidRepository: IInoutboundMssqlRepository,
		@Inject(IO_MONGO_REPOSITORY) private readonly inventoryEpcRepository: IInoutboundMongoRepository
	) {}

	public async execute({ command }: BulkWriteInventoryCommand) {
		const { data, sn } = command.payload

		const epcs = ElectronicProductCode.createFactory(data.tagList.map((tag) => ({ sku: tag.epc })))

		const scannedEpcs = await this.rfidRepository.getEpcsInformation(epcs)

		if (scannedEpcs.length === 0) return

		console.log('request.action', command.action)

		await this.inventoryEpcRepository.bulkWriteInventoryEpcs({
			action: command.action,
			payload: {
				eProductCodes: scannedEpcs,
				deviceSerialNumber: sn
			}
		})
	}
}
