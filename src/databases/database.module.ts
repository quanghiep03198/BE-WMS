import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import {
	DATA_SOURCE_DATA_LAKE,
	DATA_SOURCE_DATA_LAKE_CENTRAL,
	DATA_SOURCE_ERP,
	DATA_SOURCE_SYSCLOUD,
	DATA_WAREHOUSE_CONNECTION,
	DATABASE_DATA_LAKE,
	DATABASE_ERP,
	DATABASE_SYSCLOUD
} from './constants'

// * Entities
import { IApplicationConfigFactory, MONGODB_CONFIG_TOKEN, MSSQL_CONFIG_TOKEN } from '@configs/index'
import { DepartmentEntity } from '@modules/department/entities/department.entity'
import {
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from '@modules/finished-goods/infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from '@modules/finished-goods/infrastructure/persistence/mssql/entities/rfid-match.entity'
import { InboundInventoryEntity } from '@modules/inventory/infrastructure/persistence/mssql/entities/inbound-inventory.view.entity'
import { InventoryAuditEntity } from '@modules/inventory/infrastructure/persistence/mssql/entities/inventory-report.entity'
import { OutboundEstimationEntity } from '@modules/inventory/infrastructure/persistence/mssql/entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from '@modules/inventory/infrastructure/persistence/mssql/entities/product-inventory.view.entity'
import { SizeInventoryEntity } from '@modules/inventory/infrastructure/persistence/mssql/entities/size-inventory.view.entity'
import { PackingEntity } from '@modules/packing/entities/packing.entity'
import { RFIDDeviceEntity } from '@modules/rfid-device/infrastructure/persistence/mssql/entities/rfid-device.entity'
import { CarLicenseSnapshotEntity } from '@modules/truckload-delivery/entities/car-license.entity'
import { TruckloadDeliveryEntity } from '@modules/truckload-delivery/entities/truckload-delivery.entity'
import { UserEntity } from '@modules/user/infrastructure/persistence/mssql/entities/user.entity'
import { StorageLocationEntity } from '@modules/warehouse/infrastructure/persistence/mssql/entities/storage-location.entity'
import { WarehouseEntity } from '@modules/warehouse/infrastructure/persistence/mssql/entities/warehouse.entity'

@Module({
	imports: [
		// * MSSQL Server
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_DATA_LAKE,
			inject: [ConfigService],
			useFactory: (configService: ConfigService<IApplicationConfigFactory>) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>(MSSQL_CONFIG_TOKEN),
					name: DATA_SOURCE_DATA_LAKE,
					database: DATABASE_DATA_LAKE,
					entities: [
						RFIDInventoryEntity,
						RFIDInventoryBackupEntity,
						RFIDMatchEntity,
						InboundInventoryEntity,
						InventoryAuditEntity,
						OutboundEstimationEntity,
						ProductInventoryReportEntity,
						ProductInventoryReportEntity,
						SizeInventoryEntity,
						RFIDDeviceEntity,
						CarLicenseSnapshotEntity,
						TruckloadDeliveryEntity,
						StorageLocationEntity,
						WarehouseEntity
					]
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_SYSCLOUD,
			inject: [ConfigService],
			useFactory: (configService: ConfigService<IApplicationConfigFactory>) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>(MSSQL_CONFIG_TOKEN),
					name: DATA_SOURCE_SYSCLOUD,
					database: DATABASE_SYSCLOUD,
					entities: [DepartmentEntity, UserEntity]
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_ERP,
			inject: [ConfigService],
			useFactory: (configService: ConfigService<IApplicationConfigFactory>) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>(MSSQL_CONFIG_TOKEN),
					name: DATA_SOURCE_ERP,
					database: DATABASE_ERP
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_DATA_LAKE_CENTRAL,
			inject: [ConfigService],
			useFactory: (configService: ConfigService<IApplicationConfigFactory>) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>(MSSQL_CONFIG_TOKEN),
					name: DATA_SOURCE_DATA_LAKE_CENTRAL,
					entities: [PackingEntity],
					host: configService.getOrThrow<string>('TENANT_CENTRAL')
				}
			}
		}),

		// * MongoDB
		MongooseModule.forRootAsync({
			inject: [ConfigService],
			connectionName: DATA_WAREHOUSE_CONNECTION,
			useFactory: (configService: ConfigService) =>
				configService.getOrThrow<MongooseModuleOptions>(MONGODB_CONFIG_TOKEN)
		})
	]
})
export class DatabaseModule {}
