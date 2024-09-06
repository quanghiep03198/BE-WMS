import { Logger, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import compression from 'compression'
import helmet from 'helmet'
import morgan from 'morgan'
import { AppModule } from './app.module'

async function bootstrap() {
	try {
		const app = await NestFactory.create(AppModule)
		const configService = app.get(ConfigService)
		app.setGlobalPrefix('/api')
		app.enableVersioning({ type: VersioningType.URI })
		app.enableCors()
		app.use(helmet())
		app.use(
			morgan('dev', {
				stream: {
					write: (str) => Logger.log(str.replace(/\n$/, ''))
				}
			})
		)
		app.use(
			compression({
				level: 6,
				threshold: 10 * 1024
			})
		)
		await app.listen(+configService.getOrThrow('PORT', { infer: true }), async () => {
			const URL = await app.getUrl()
			Logger.log(URL, 'Server')
		})
	} catch (error) {
		Logger.error(error.message)
	}
}

bootstrap()
