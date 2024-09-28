import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { genSaltSync, hashSync } from 'bcrypt'
import { stringify } from 'querystring'
import { DataSource, Repository } from 'typeorm'
import { BaseAbstractService } from '../../_base/base.abstract.service'
import { ChangePasswordDTO, RegisterDTO, UpdateProfileDTO } from '../dto/user.dto'
import { EmployeeEntity } from '../entities/employee.entity'
import { UserEntity } from '../entities/user.entity'

type AvatarGenerateOptions = {
	name: string
	background?: string
	color?: string
	length?: number
	bold?: boolean
	format?: 'svg' | 'png'
}

@Injectable()
export class UserService extends BaseAbstractService<UserEntity> {
	constructor(
		@InjectDataSource(DATA_SOURCE_SYSCLOUD)
		private syscloudDataSource: DataSource,
		@InjectRepository(UserEntity, DATA_SOURCE_SYSCLOUD)
		private userRepository: Repository<UserEntity>,
		@InjectRepository(EmployeeEntity, DATA_SOURCE_SYSCLOUD)
		private employeeRepository: Repository<EmployeeEntity>,
		private configService: ConfigService
	) {
		super(userRepository)
	}

	async createUser(payload: RegisterDTO) {
		const user = await this.userRepository.findOne({ where: { username: payload.username } })
		if (user) throw new ConflictException('User already exists')
		const newUser = this.userRepository.create(payload) // Tạo thực thể User từ payload
		return await this.userRepository.save(newUser) // Save sẽ kích hoạt BeforeInsert
	}

	async getProfile(id: number): Promise<UserEntity> {
		const user = await this.userRepository
			.createQueryBuilder('u')
			.select('u.id', 'id')
			.addSelect('u.password', 'password')
			.addSelect('u.role', 'role')
			.addSelect('e.employee_name', 'display_name')
			.addSelect('e.employee_code', 'employee_code')
			.addSelect('e.email', 'email')
			.addSelect('e.phone', 'phone')
			.innerJoin(EmployeeEntity, 'e', 'u.employee_code = e.employee_code')
			.where('u.id = :id', { id })
			.getRawOne()

		return {
			...user,
			password: hashSync(user.password, genSaltSync(+this.configService.get('SALT_ROUND'))),
			picture: this.generateAvatar({ name: user?.display_name })
		}
	}

	async findUserByUsername(username: string) {
		return await this.userRepository.findOneBy({ username })
	}

	async getUserCompany(userId: number) {
		return await this.syscloudDataSource.manager
			.createQueryBuilder()
			.select(['DISTINCT f.factory_code AS company_code', 'f.factory_extcode as factory_code'])
			.from('ts_user', 'u')
			.innerJoin('ts_employee', 'e', 'e.employee_code = u.employee_code')
			.innerJoin('ts_employeedept', 'ed', 'ed.employee_code = e.employee_code')
			.innerJoin('ts_dept', 'd', 'd.dept_code = ed.dept_code')
			.innerJoin('ts_factory', 'f', 'f.factory_code = d.company_code')
			.where('u.id = :id', { id: userId })
			.andWhere('f.factory_extcode <> :factoryCode', { factoryCode: 'GL5' })
			.orderBy('factory_extcode', 'ASC')
			.getRawMany()
	}

	async storeUserToken(userId, token) {
		return await this.userRepository.update(userId, { remember_token: token })
	}

	async updateProfile(employeeCode: string, payload: UpdateProfileDTO) {
		const userProfile = await this.employeeRepository.findOneBy({ employee_code: employeeCode })
		if (!userProfile) throw new NotFoundException('User could not be found')
		return await this.employeeRepository.save({ ...userProfile, ...payload })
	}

	async changePassword(userId: number, payload: ChangePasswordDTO) {
		return await this.userRepository.update(userId, payload)
	}

	private generateAvatar({
		background = '#525252',
		color = '#fafafa',
		length = 1,
		bold = true,
		format = 'svg',
		name
	}: AvatarGenerateOptions) {
		const BASE_AVATAR_URL = 'https://ui-avatars.com/api/'
		return (
			BASE_AVATAR_URL +
			'?' +
			stringify({
				background,
				color,
				length,
				bold,
				format,
				name
			})
		)
	}
}
