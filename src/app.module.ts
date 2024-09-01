import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { DynamicDataSourceService } from './common/services/dynamic-datasource.service'
import { DatabaseModule } from './databases/database.module'
import { DynamicDataSourceMiddleware } from './middlewares/dynamic-datasource.middleware'
import { AuthModule } from './modules/auth/auth.module'
import { RfidModule } from './modules/rfid/rfid.module'
import { UserModule } from './modules/user/user.module'
import { WarehouseModule } from './modules/warehouse/warehouse.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			envFilePath: '.env',
			isGlobal: true,
			load: []
		}),
		DatabaseModule,
		AuthModule,
		UserModule,
		WarehouseModule,
		RfidModule
	],
	controllers: [],
	providers: [DynamicDataSourceService]
})
export class AppModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(DynamicDataSourceMiddleware).forRoutes({ path: 'rfid/*', method: RequestMethod.ALL })
	}
}
