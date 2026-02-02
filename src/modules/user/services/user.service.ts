import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { RefreshTokenEntity } from '@/modules/auth/entities/refresh-token.entity'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { stringify } from 'node:querystring'
import { DataSource, Equal, Not, Repository } from 'typeorm'
import { BaseAbstractService } from '../../_base/base.abstract.service'
import { ChangePasswordDTO, CreateUserDTO, UpdateProfileDTO, UpdateUserDTO, UpdateUserStatusDTO } from '../dto/user.dto'
import { EmployeeEntity } from '../entities/employee.entity'
import { UserEntity } from '../entities/user.entity'
import { IUser } from '../user.interface'

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

	override async findAll(): Promise<UserEntity[]> {
		return await this.userRepository.find({ where: { is_system_user: false } })
	}

	override async insertOne(
		payload: CreateUserDTO & Pick<UserEntity, 'user_code_created' | 'user_name_created'>
	): Promise<UserEntity> {
		const user = await this.userRepository.findOne({
			where: [{ username: payload.username }, { email: payload.email }, { employee_code: payload.employee_code }]
		})
		if (user) throw new ConflictException(this.i18nService.t('auth.user_exists'))
		const newUser = this.userRepository.create({
			...payload,
			picture: this.generateAvatar({ name: payload.username })
		})
		return await this.userRepository.save(newUser)
	}

	async getProfile(username: string): Promise<Partial<UserEntity> & { picture: string }> {
		const user = await this.findByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')
		return user
	}

	async findByUsername(username: string) {
		return await this.userRepository.findOne({
			where: { username, is_active: true }
		})
	}

	async updateOneByUsername(
		username,
		payload: UpdateUserDTO & Pick<IUser, 'user_code_updated' | 'user_name_updated'>
	) {
		return await this.userRepository.update({ username }, payload)
	}

	async updateProfile(username: string, payload: UpdateProfileDTO) {
		const userProfile = await this.userRepository.existsBy({ username })
		if (!userProfile) throw new NotFoundException('User could not be found')
		const isUserEmailExists = await this.userRepository.existsBy({
			username: Not(Equal(username)),
			email: payload.email
		})
		if (isUserEmailExists) throw new ConflictException(this.i18nService.t('auth.user_exists'))
		return await this.userRepository.update({ username }, payload)
	}

	async changePassword(username: string, payload: ChangePasswordDTO) {
		const user = await this.findByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')
		if (!user.authenticate(payload.currentPassword))
			throw new BadRequestException(this.i18nService.t('auth.incorrect_password'))
		user.password = payload.password
		await user.encryptPassword()
		return await this.userRepository.update({ username }, { password: user.password })
	}

	async updateUserActiveStatus(
		username: string,
		update: UpdateUserStatusDTO & Pick<IUser, 'user_code_updated' | 'user_name_updated'>
	) {
		const queryRunner = this.dataSourceSC.createQueryRunner()
		await queryRunner.connect()
		try {
			await queryRunner.startTransaction()

			const result = await queryRunner.manager.getRepository(UserEntity).update(
				{ username },
				{
					...update,
					remark: `${update.is_active ? 'Reactivated' : 'Deactivated'} by ${update.user_code_updated} at ${format(new Date(), 'yyyy-MM-dd HH:mm')}`
				}
			)

			if (!update.is_active) {
				await queryRunner.manager.getRepository(RefreshTokenEntity).update({ username }, { revoked_at: new Date() })
				await this.cacheManager.del(`token:${username}`)
			}

			await queryRunner.commitTransaction()

			return result
		} catch (error) {
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw error
		} finally {
			if (queryRunner.isReleased === false) await queryRunner.release()
		}
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
