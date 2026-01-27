import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { I18nService } from 'nestjs-i18n'
import { stringify } from 'node:querystring'
import { DataSource, Repository } from 'typeorm'
import { BaseAbstractService } from '../../_base/base.abstract.service'
import { UserRole } from '../constants'
import { ChangePasswordDTO, CreateUserDTO, UpdateProfileDTO } from '../dto/user.dto'
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
		private readonly dataSourceSC: DataSource,
		@InjectRepository(UserEntity, DATA_SOURCE_SYSCLOUD)
		private readonly userRepository: Repository<UserEntity>,
		@InjectRepository(EmployeeEntity, DATA_SOURCE_SYSCLOUD)
		private readonly employeeRepository: Repository<EmployeeEntity>,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly i18nService: I18nService
	) {
		super(userRepository)
	}

	override async insertOne(
		payload: CreateUserDTO & Pick<UserEntity, 'user_code_created' | 'user_name_created'>
	): Promise<UserEntity> {
		const user = await this.userRepository.findOne({ where: { username: payload.username } })
		if (user) throw new ConflictException('User already exists')
		const newUser = this.userRepository.create(payload)
		return await this.userRepository.save(newUser)
	}

	async getProfile(username: string): Promise<Partial<UserEntity> & { picture: string }> {
		const user = await this.findUserByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')

		return {
			...user,
			picture: this.generateAvatar({ name: user?.display_name })
		}
	}

	async findUserByUsername(username: string) {
		return await this.userRepository.findOne({
			select: {
				id: true,
				username: true,
				display_name: true,
				password: true,
				email: true,
				employee_code: true,
				roles: true,
				authorized_factory_codes: true
			},
			where: { username, is_active: true }
		})
	}

	async updateProfile(employeeCode: string, payload: UpdateProfileDTO) {
		const userProfile = await this.employeeRepository.findOneBy({ employee_code: employeeCode })
		if (!userProfile) throw new NotFoundException('User could not be found')
		return await this.employeeRepository.save({ ...userProfile, ...payload })
	}

	async updateLastLogin(username: string) {
		return await this.userRepository.update({ username }, { last_login_at: new Date() })
	}

	async changePassword(username: string, payload: ChangePasswordDTO) {
		return await this.userRepository.update({ username }, { ...payload, password_changed_at: new Date() })
	}

	async resetPassword(username: string) {
		const user = await this.findUserByUsername(username)
		if (!user) throw new NotFoundException(this.i18nService.t('auth.user_not_found'))
	}

	async authorizeRoles(username: string, authorizedRoles: Array<UserRole>) {
		return await this.userRepository.update({ username }, { roles: authorizedRoles })
	}

	async deactivateUser(username: string) {
		await await this.userRepository.update({ username }, { is_active: false })
		await this.cacheManager.del(`token:${username}`)
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

	/**
	 * @deprecated
	 * @param username
	 * @returns
	 */
	async getUserCompany(username: string) {
		return await this.dataSourceSC.manager
			.createQueryBuilder()
			.select(['DISTINCT f.factory_code AS company_code', 'f.factory_extcode as factory_code'])
			.from('ts_user', 'u')
			.innerJoin('ts_employee', 'e', 'e.employee_code = u.employee_code')
			.innerJoin('ts_employeedept', 'ed', 'ed.employee_code = e.employee_code')
			.innerJoin('ts_dept', 'd', 'd.dept_code = ed.dept_code')
			.innerJoin('ts_factory', 'f', 'f.factory_code = d.company_code')
			.where('u.user_code = :username', { username })
			.andWhere('f.factory_extcode <> :factoryCode', { factoryCode: 'GL5' })
			.orderBy('factory_extcode', 'ASC')
			.getRawMany()
	}
}
