import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { pick } from 'lodash'
import { Repository } from 'typeorm'
import { UserEntity } from '../user/entities/user.entity'
import { IUser } from '../user/user.interface'
import { LoginDTO, UpdateProfileDTO } from './dto/auth.dto'

@Injectable()
export class AuthService {
	constructor(
		@InjectRepository(UserEntity)
		private repository: Repository<UserEntity>,
		private jwtService: JwtService,
		private configService: ConfigService
	) {}

	async generateToken(payload: any) {
		return await this.jwtService.signAsync(payload, {
			secret: this.configService.get('JWT_SECRET')
		})
	}

	async validateUser(payload: LoginDTO) {
		const user = await this.repository.findOne({ where: { username: payload.username } })
		if (!user) throw new NotFoundException('User could not be found')
		if (!user.authenticate(payload.password)) throw new BadRequestException('Password is incorrect')
		console.log(user)
		return user
	}

	async login(user: IUser) {
		const token = await this.generateToken(pick(user, 'id'))
		return { user, token }
	}

	async refreshToken(userId: number) {
		return await this.generateToken({ _id: userId })
	}

	async updateProfile(id: number, payload: UpdateProfileDTO) {
		return await this.repository.update({ id }, payload)
	}
}
