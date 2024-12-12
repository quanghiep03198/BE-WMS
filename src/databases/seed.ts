import { Logger } from '@nestjs/common'
import { runSeeders } from 'typeorm-extension'
import dataSource from './data-source'
import SampleSeeder from './seeds/sample/sample.seeder'

const bootstrap = async () => {
	const logger = new Logger('Seeder')
	try {
		logger.log('Running seeders...')
		await dataSource.initialize()
		await runSeeders(dataSource, { seeds: [SampleSeeder] })
		logger.log('Seeders executed successfully')
	} catch (error) {
		logger.error(error)
	} finally {
		process.exit()
	}
}

bootstrap()
