import { DataSources } from '@/common/constants/global.enum'
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { stringify } from 'querystring'
import { DataSource, Repository } from 'typeorm'
import { RegisterDTO } from './dto/user.dto'
import { EmployeeEntity } from './entities/employee.entity'
import { UserEntity } from './entities/user.entity'

type TAvatarGenOptions = {
	name: string
	background?: string
	color?: string
	length?: number
	bold?: boolean
	format?: 'svg' | 'png'
}

@Injectable()
export class UserService {
	constructor(
		@InjectDataSource(DataSources.SYSCLOUD)
		private readonly syscloudDataSource: DataSource,
		@InjectRepository(UserEntity, DataSources.SYSCLOUD)
		private readonly userRepository: Repository<UserEntity>
	) {}

	async createUser(payload: RegisterDTO) {
		const user = await this.userRepository.findOne({ where: { username: payload.username } })
		if (user) throw new ConflictException('User already exists')
		const newUser = this.userRepository.create(payload) // Tạo thực thể User từ payload
		return await this.userRepository.save(newUser) // Save sẽ kích hoạt BeforeInsert
	}

	async getProfile(id: number) {
		const user = await this.userRepository
			.createQueryBuilder('u')
			.select([
				'u.keyid AS id',
				'e.employee_name AS display_name',
				'e.email AS email',
				'e.phone AS phone',
				'ISNULL(u.isadmin, 0) AS isadmin'
			])
			.innerJoin(EmployeeEntity, 'e', 'u.employee_code = e.employee_code')
			.where('u.keyid = :id', { id })
			.getRawOne()

		return { ...user, picture: this.generateAvatar({ name: user?.display_name }) }
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
			.where('u.keyid = :id', { id: userId })
			.andWhere('f.factory_extcode <> :factoryCode', { factoryCode: 'GL5' })
			.orderBy('factory_extcode', 'ASC')
			.getRawMany()
	}

	async storeUserToken(userId, token) {
		return await this.userRepository.update(userId, { remember_token: token })
	}

	private generateAvatar({
		background = '#525252',
		color = '#fafafa',
		length = 1,
		bold = true,
		format = 'svg',
		name
	}: TAvatarGenOptions) {
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
