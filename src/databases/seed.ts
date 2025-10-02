import { Logger, PinoLogger } from 'nestjs-pino'
import { runSeeders } from 'typeorm-extension'
import dataSource from './data-source'
import { DefectiveGoodsSeeder } from './seeds/defective-goods.seeder'

const bootstrap = async () => {
	const logger = new Logger(
		new PinoLogger({
			renameContext: 'Seeding',
			pinoHttp: {
				name: 'Seeding',
				transport: {
					targets: [
						{
							target: 'pino-pretty',
							level: 'info',
							options: {
								translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
							}
						}
					]
				}
			}
		}),
		{ renameContext: 'Seeding' }
	)
	try {
		logger.log('Running seeders...')
		await dataSource.initialize()
		await runSeeders(dataSource, { seeds: [DefectiveGoodsSeeder] })
		logger.log('Seeders executed successfully')
	} catch (error) {
		logger.error(error)
	} finally {
		await dataSource.destroy()
		process.exit()
	}
}

bootstrap()
