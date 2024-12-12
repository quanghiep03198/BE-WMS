import { setSeederFactory } from 'typeorm-extension'
import { SampleEntity } from './sample.entity'

/**
 * @deprecated
 */
export const SampleFactory = setSeederFactory(SampleEntity, (faker) => {
	const sampleData = new SampleEntity()
	sampleData.firstName = faker.person.firstName('male')
	sampleData.lastName = faker.person.lastName('male')
	sampleData.email = faker.internet.email({ firstName: sampleData.firstName, lastName: sampleData.lastName })
	return sampleData
})
