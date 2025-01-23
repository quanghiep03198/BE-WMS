import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { IThirdPartyApiHelper } from './interfaces/third-party-api.helper.interface'

/**
 * @deprecated
 * ! This helper is deprecated and will be removed in the future
 * @description Helper for third-party APIs
 */
@Injectable()
export class ThirdPartyApiHelper implements IThirdPartyApiHelper {
	constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

	/**
	 * @description Get sync process
	 * @param {string} register
	 * @returns
	 */
	async getSyncProcess(register: string) {
		return await this.cacheManager.get<true | null>(`sync_process:${register}`)
	}

	/**
	 * @description Mark sync process as started
	 * @param {string} register
	 * @returns
	 */
	async startSyncProcess(register: string) {
		this.cacheManager.set(`sync_process:${register}`, true, 60 * 1000 * 5)
	}

	/**
	 * @description Mark sync process as exited
	 * @param {string} register
	 * @returns
	 */
	async exitSyncProcess(register: string) {
		return await this.cacheManager.del(`sync_process:${register}`)
	}
}
