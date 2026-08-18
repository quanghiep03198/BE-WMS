import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { CDC_PROVISION_CONFIGS } from '../constants'
import { CdcProvisionConfig } from '../types'
import { CdcExplorerService } from './cdc-explorer.service'
import { CdcProvisionerService } from './cdc-provision.service'
import { CdcSchedulerService } from './cdc-scheduler.service'

@Injectable()
export class CdcBootstrapService implements OnApplicationBootstrap {
	private readonly logger = new Logger(CdcBootstrapService.name)

	constructor(
		@Inject(CDC_PROVISION_CONFIGS) private readonly configs: CdcProvisionConfig[],
		private readonly provisioner: CdcProvisionerService,
		private readonly explorer: CdcExplorerService,
		private readonly scheduler: CdcSchedulerService
	) {}

	async onApplicationBootstrap(): Promise<void> {
		this.logger.log('Starting CDC provisioning...')
		await this.provisioner.provisionAll(this.configs)

		setImmediate(() => {
			const handlers = this.explorer.discover()
			this.scheduler.start(handlers)
		})
	}
}
