import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { BaseTypeOrmRepository } from '@modules/_base/repositories/base-typeorm.abstract.repository'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { UserEntity } from '../entities/user.entity'

@Injectable()
export class RmdbsUserRepository extends BaseTypeOrmRepository<UserEntity> {
	constructor(
		@InjectRepository(UserEntity, DATA_SOURCE_SYSCLOUD)
		private readonly userRepository: Repository<UserEntity>
	) {
		super(userRepository)
	}

	findOneByUsername(username: string) {
		return this.userRepository.findOneBy({ username })
	}

	async updateOneByUsername(username: string, update: Partial<UserEntity>) {
		return this.userRepository.update({ username }, update)
	}

	async deleteManyByUsernames(usernames: string[]) {
		return this.userRepository.delete({ username: In(usernames) })
	}
}
