import { NestFactory } from '@nestjs/core'
import compression from 'compression'
import helmet from 'helmet'
import morgan from 'morgan'
import { AppModule } from './app.module'

async function bootstrap() {
	try {
		const app = await NestFactory.create(AppModule)
		app.setGlobalPrefix('/api')
		app.enableCors()
		app.use(helmet())
		app.use(morgan('tiny'))
		app.use(
			compression({
				level: 6,
				threshold: 10 * 1024
			})
		)

		const PORT = process.env.PORT || 3000
		await app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
	} catch (error) {
		console.log(error)
	}
}
bootstrap()
