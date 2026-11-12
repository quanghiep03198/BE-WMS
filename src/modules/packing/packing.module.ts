import { DATA_SOURCE_DATA_LAKE_CENTRAL } from '@databases/constants'
import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ManifestExportWorker } from './consumers/manifest-export.consumer'
import { ManifestController } from './controllers/manifest.controller'
import { PackingController } from './controllers/packing.controller'
import { PackingEntity } from './entities/packing.entity'
import { ManifestRepository } from './repositories/manifest.repository'
import { ExportStorageService } from './services/export-storage.service'
import { MANIFEST_EXPORT_QUEUE, ManifestExportService } from './services/manifest-export.service'
import { ManifestService } from './services/manifest.service'
import { PackingService } from './services/packing.service'
import { PackingEntitySubscriber } from './subscribers/packing.entity.subscriber'

@Module({
	imports: [
		TypeOrmModule.forFeature([PackingEntity], DATA_SOURCE_DATA_LAKE_CENTRAL),
		BullModule.registerQueue({ name: MANIFEST_EXPORT_QUEUE })
	],
	controllers: [PackingController, ManifestController],
	providers: [
		PackingService,
		PackingEntitySubscriber,
		ManifestRepository,
		ManifestService,
		ExportStorageService,
		ManifestExportService,
		ManifestExportWorker
	]
})
export class PackingModule {}
