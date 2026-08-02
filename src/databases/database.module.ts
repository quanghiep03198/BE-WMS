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
import { DepartmentEntity } from '@modules/department/entities/department.entity'
import {
	RFIDInventoryBackupEntity,
	RFIDInventoryEntity
} from '@modules/finished-goods/infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from '@modules/finished-goods/infrastructure/persistence/mssql/entities/rfid-match.entity'
import { InboundInventoryEntity } from '@modules/inventory/entities/inbound-inventory.view.entity'
import { InventoryAuditEntity } from '@modules/inventory/entities/inventory-report.entity'
import { OutboundEstimationEntity } from '@modules/inventory/entities/outbound-inventory.view.entity'
import { ProductInventoryReportEntity } from '@modules/inventory/entities/product-inventory.view.entity'
import { SizeInventoryEntity } from '@modules/inventory/entities/size-inventory.view.entity'
import { PackingEntity } from '@modules/packing/entities/packing.entity'
import { RFIDDeviceEntity } from '@modules/rfid-device/entities/rfid-device.entity'
import { CarLicenseSnapshotEntity } from '@modules/truckload-delivery/entities/car-license.entity'
import { TruckloadDeliveryEntity } from '@modules/truckload-delivery/entities/truckload-delivery.entity'
import { EmployeeEntity } from '@modules/user/entities/employee.entity'
import { UserEntity } from '@modules/user/entities/user.entity'
import { OldUserEntity } from '@modules/user/entities/user.old.entity'
import { StorageLocationEntity } from '@modules/warehouse/entities/storage-location.entity'
import { WarehouseEntity } from '@modules/warehouse/entities/warehouse.entity'

@Module({
	imports: [
		// * MSSQL Server
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_DATA_LAKE,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
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
			useFactory: (configService: ConfigService) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
					database: DATABASE_SYSCLOUD,
					entities: [UserEntity, DepartmentEntity, EmployeeEntity, OldUserEntity]
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_ERP,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
					database: DATABASE_ERP
				}
			}
		}),
		TypeOrmModule.forRootAsync({
			name: DATA_SOURCE_DATA_LAKE_CENTRAL,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				return {
					...configService.getOrThrow<SqlServerConnectionOptions>('mssql'),
					// database: DATABASE_DATA_LAKE,
					entities: [PackingEntity],
					host: configService.getOrThrow<string>('TENANT_CENTRAL')
				}
			}
		}),

		// * MongoDB
		MongooseModule.forRootAsync({
			inject: [ConfigService],
			connectionName: DATA_WAREHOUSE_CONNECTION,
			useFactory: (configService: ConfigService) => configService.getOrThrow<MongooseModuleOptions>('mongodb')
		})
	]
})
export class DatabaseModule {}
