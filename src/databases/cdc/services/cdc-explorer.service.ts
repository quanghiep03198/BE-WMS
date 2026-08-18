import { Injectable, Logger } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'

import { CDC_HANDLER_METADATA, CdcHandlerOptions } from '../decorators'
import { ICdcHandler } from '../types'

export interface DiscoveredCdcHandler {
	options: CdcHandlerOptions
	instance: ICdcHandler
}

@Injectable()
export class CdcExplorerService {
	private readonly logger = new Logger(CdcExplorerService.name)

	constructor(
		private readonly discoveryService: DiscoveryService,
		private readonly reflector: Reflector
	) {}

	discover(): DiscoveredCdcHandler[] {
		const result: DiscoveredCdcHandler[] = []
		const providers = this.discoveryService.getProviders()

		for (const wrapper of providers) {
			const { instance, metatype } = wrapper
			if (!instance || !metatype) continue

			const options = this.reflector.get<CdcHandlerOptions>(CDC_HANDLER_METADATA, metatype)
			if (!options) continue

			result.push({ options, instance: instance as ICdcHandler })
			this.logger.log(`Discovered CDC handler: ${options.dataSourceToken}.${options.sourceName}`)
		}

		this.checkDuplicateCheckpointKeys(result)
		return result
	}

	private checkDuplicateCheckpointKeys(handlers: DiscoveredCdcHandler[]): void {
		const seen = new Map<string, string>()
		for (const { options } of handlers) {
			const key = `${options.dataSourceToken}:${options.schema}.${options.sourceName}`
			const existing = seen.get(key)
			if (existing) {
				throw new Error(`Duplicate CDC config between ${existing} and ${options.sourceName}`)
			}
			seen.set(key, options.sourceName)
		}
	}
}
