import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { Repository } from 'typeorm'
import {
	ICarLicensePlateRepository,
	LicensePlateSnapshot
} from '../../../../application/ports/car-license-plate.repository.port'
import { CarLicenseSnapshotEntity } from '../entities/car-license.entity'

@Injectable()
export class CarLicensePlateRepository implements ICarLicensePlateRepository {
	constructor(
		@InjectRepository(CarLicenseSnapshotEntity, DATA_SOURCE_DATA_LAKE)
		private readonly carLicenseSnapshotRepository: Repository<CarLicenseSnapshotEntity>
	) {}

	async findLatestSnapshot(licensePlate: string, from: Date, to: Date): Promise<LicensePlateSnapshot | null> {
		return await this.carLicenseSnapshotRepository
			.createQueryBuilder('snapshot')
			.where('TRIM(UPPER(snapshot.plate_name)) = :licensePlate', { licensePlate: licensePlate.trim().toUpperCase() })
			.andWhere('snapshot.snap_time BETWEEN CAST(:from AS DATETIME) AND CAST(:to AS DATETIME)', {
				from: format(new Date(from), 'yyyy-MM-dd HH:mm:ss'),
				to: format(new Date(to), 'yyyy-MM-dd HH:mm:ss')
			})
			.orderBy('snapshot.snap_time', 'DESC')
			.getOne()
	}
}
