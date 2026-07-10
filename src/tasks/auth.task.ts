import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { RefreshTokenEntity } from '@modules/auth/entities/refresh-token.entity'
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'

@Injectable()
export class AuthTask {
	constructor(
		@InjectRepository(RefreshTokenEntity, DATA_SOURCE_SYSCLOUD)
		private readonly refreshTokenRepository: Repository<RefreshTokenEntity>
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'DELETE_OLD_EXPIRED_TOKENS_EVERY_DAY_AT_2AM' })
	async deleteOldExpiredTokens() {
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		await this.refreshTokenRepository.delete({
			revoked_at: LessThan(thirtyDaysAgo)
		})
	}
}
