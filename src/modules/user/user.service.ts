import { ConflictException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { RegisterDTO } from './dto/user.dto'
import { UserEntity } from './entities/user.entity'

@Injectable()
export class UserService {
	constructor(
		@InjectRepository(UserEntity)
		private repository: Repository<UserEntity>,
		private configService: ConfigService
	) {}

	async createUser(payload: RegisterDTO) {
		const user = await this.repository.findOne({ where: { username: payload.username } })

		if (user) throw new ConflictException('User already exists')
		const newUser = this.repository.create(payload) // Tạo thực thể User từ payload
		return await this.repository.save(newUser) // Save sẽ kích hoạt BeforeInsert
	}
}
