import { faker } from '@faker-js/faker'
import { Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Seeder } from 'typeorm-extension'
import { SampleEntity } from './sample.entity'

export default class SampleSeeder implements Seeder {
	track = false

	public async run(dataSource: DataSource): Promise<any> {
		try {
			const repository = dataSource.getRepository(SampleEntity)

			const data = new Array(20).fill(null).map(() => {
				const sampleData = new SampleEntity()
				sampleData.firstName = faker.person.firstName()
				sampleData.lastName = faker.person.lastName()
				sampleData.email = faker.internet.email({
					firstName: sampleData.firstName,
					lastName: sampleData.lastName
				})
				return sampleData
			})

			await repository.insert(data)
		} catch (error) {
			Logger.error(error)
		}
	}
}
