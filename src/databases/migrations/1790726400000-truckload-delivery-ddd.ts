import { MigrationInterface, QueryRunner } from 'typeorm'

export class TruckloadDeliveryDdd1790726400000 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			IF COL_LENGTH('dbo.dv_truckload_delivery', 'actual_factory_departure_time') IS NULL
				ALTER TABLE dbo.dv_truckload_delivery ADD actual_factory_departure_time datetime NULL;
			IF COL_LENGTH('dbo.dv_truckload_delivery', 'sync_id') IS NULL
				ALTER TABLE dbo.dv_truckload_delivery ADD sync_id nvarchar(100) NULL;
			IF COL_LENGTH('dbo.dv_truckload_delivery', 'seal_number') IS NULL
				ALTER TABLE dbo.dv_truckload_delivery ADD seal_number nvarchar(50) NULL;
			IF COL_LENGTH('dbo.dv_truckload_delivery', 'factory_entrance_time') IS NULL
				ALTER TABLE dbo.dv_truckload_delivery ADD factory_entrance_time datetime NULL;
			IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_dv_truckload_delivery_dispatch_po' AND object_id = OBJECT_ID('dbo.dv_truckload_delivery'))
				CREATE UNIQUE INDEX UQ_dv_truckload_delivery_dispatch_po ON dbo.dv_truckload_delivery(dispatch_order, po);
		`)
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_dv_truckload_delivery_dispatch_po' AND object_id = OBJECT_ID('dbo.dv_truckload_delivery'))
				DROP INDEX UQ_dv_truckload_delivery_dispatch_po ON dbo.dv_truckload_delivery;
		`)
	}
}
