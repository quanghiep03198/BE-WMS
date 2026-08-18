import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { DynamicModule, Global, Module, Provider } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { MongooseModule } from '@nestjs/mongoose'
import { CDC_PROVISION_CONFIGS } from './constants'
import { CDC_QUARANTINE_COLLECTION, CdcQuarantine, CdcQuarantineSchema } from './schemas/cdc-quarantine.schema'
import { CdcBootstrapService } from './services/cdc-bootstrap.service'
import { CdcEchoRegistryService } from './services/cdc-echo-registery.service'
import { CdcExplorerService } from './services/cdc-explorer.service'
import { CdcProvisionerService } from './services/cdc-provision.service'
import { CdcSchedulerService } from './services/cdc-scheduler.service'
import { CdcWatcherService } from './services/cdc-watcher.service'
import { CdcModuleAsyncOptions, CdcModuleOptionsFactory, CdcProvisionConfig } from './types'

const CORE_PROVIDERS: Provider[] = [
	CdcProvisionerService,
	CdcExplorerService,
	CdcWatcherService,
	CdcSchedulerService,
	CdcBootstrapService,
	CdcEchoRegistryService
]

const CORE_IMPORTS = [
	DiscoveryModule,
	MongooseModule.forFeature(
		[{ name: CdcQuarantine.name, collection: CDC_QUARANTINE_COLLECTION, schema: CdcQuarantineSchema }],
		DATA_WAREHOUSE_CONNECTION
	)
]

@Global()
@Module({})
export class CdcModule {
	static register(configs: CdcProvisionConfig[]): DynamicModule {
		return {
			module: CdcModule,
			imports: CORE_IMPORTS,
			providers: [{ provide: CDC_PROVISION_CONFIGS, useValue: configs }, ...CORE_PROVIDERS],
			exports: [CdcExplorerService, CdcEchoRegistryService]
		}
	}

	static registerAsync(options: CdcModuleAsyncOptions): DynamicModule {
		return {
			module: CdcModule,
			imports: [...(options.imports ?? []), ...CORE_IMPORTS],
			providers: [...this.createAsyncProviders(options), ...CORE_PROVIDERS],
			exports: [CdcExplorerService, CdcEchoRegistryService]
		}
	}

	private static createAsyncProviders(options: CdcModuleAsyncOptions): Provider[] {
		if (options.useFactory) {
			return [
				{
					provide: CDC_PROVISION_CONFIGS,
					useFactory: options.useFactory,
					inject: options.inject ?? []
				}
			]
		}

		if (options.useExisting) {
			return [
				{
					provide: CDC_PROVISION_CONFIGS,
					useFactory: async (factory: CdcModuleOptionsFactory) => factory.createCdcOptions(),
					inject: [options.useExisting]
				}
			]
		}

		if (options.useClass) {
			return [
				options.useClass,
				{
					provide: CDC_PROVISION_CONFIGS,
					useFactory: async (factory: CdcModuleOptionsFactory) => factory.createCdcOptions(),
					inject: [options.useClass]
				}
			]
		}

		throw new Error('CdcModule.registerAsync() requires one of useFactory, useClass, or useExisting')
	}
}
