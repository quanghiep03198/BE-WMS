import { runSeeders } from 'typeorm-extension'
import dataSource from '../data-source'

dataSource.initialize().then(async () => {
	await dataSource.initialize()
	await runSeeders(dataSource)
	process.exit()
})
