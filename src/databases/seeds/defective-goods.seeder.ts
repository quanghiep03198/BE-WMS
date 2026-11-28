/* eslint-disable @typescript-eslint/no-unused-vars */
import { DefectiveGoodsEntity } from '@modules/defective-goods/infrastructure/persistence/mssql/entities/defective-goods.entity'
import { DataSource } from 'typeorm'
import { Seeder, SeederFactoryManager } from 'typeorm-extension'

export class DefectiveGoodsSeeder implements Seeder {
	track = true

	public async run(dataSource: DataSource, _factoryManager: SeederFactoryManager): Promise<any> {
		const repository = dataSource.getRepository(DefectiveGoodsEntity)

		const DESCRIPTION = /* html */ `
            <h3>1. Detected Defect Types</h3>
            <ul data-type="taskList">
                <li data-type="taskItem" data-checked="false">Scratches on leather/fabric surface</li>
                <li data-type="taskItem" data-checked="false">Glue peeling / open glue</li>
                <li data-type="taskItem" data-checked="false">Wrong color / color fading</li>
                <li data-type="taskItem" data-checked="false">Sewing defects (misaligned, loose thread, excess thread)</li>
                <li data-type="taskItem" data-checked="false">Dirty, stains that cannot be cleaned</li>
                <li data-type="taskItem" data-checked="false">Shape defects (misaligned form, distorted, unbalanced)</li>
                <li data-type="taskItem" data-checked="false">Sole defects (dented, cracked, chipped)</li>
                <li data-type="taskItem" data-checked="false">Others: ...</li>
            </ul>

            <h3>2. Detailed Defect Description</h3>
            <ul data-type="bulletList">
                <li data-type="listItem">..............................................................................................................</li>
                <li data-type="listItem">..............................................................................................................</li>
                <li data-type="listItem">..............................................................................................................</li>
            </ul>
            
            <h3>3. Illustrative Images</h3>
            <p class="my-1"><span style="color:rgb(163, 163, 163)">(Insert illustrative image)</span></p>
        `

		await repository.query(/* SQL */ `
            INSERT INTO DV_DATA_LAKE.dbo.dv_defective_goods
            (
                epc,
                brand_name,
                factory_shoes_style,
                cust_shoes_style,
                size_code,
                color_sn,
                mo_no,
                po,
                isactive,
                defective_category,
                defective_location,
                inbound_date,
                storage_location,
                defective_description
            )
            SELECT 
                a.EPC_Code epc,
                c.brand_name AS brand_name,
                a.shoestyle_codefactory factory_shoes_style,
                a.cust_shoestyle cust_shoes_style,
                a.size_numcode size_code,
                d.color_sn,
                NULL AS mo_no,
                NULL AS po,
                a.isactive,
                'RD' defective_category,
                'A' defective_location,
                DATEADD(MONTH, -2, GETDATE()) AS inbound_date,
                'A1' AS storage_location,
                '${DESCRIPTION}' AS defective_description

            FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst a
            INNER JOIN wuerp_vnrd.dbo.ta_manufacturmst b ON a.mo_no = b.mo_no
            INNER JOIN wuerp_vnrd.dbo.ta_brand c ON b.custbrand_id = c.custbrand_id  AND brand_code IN ('UG', 'TV', 'KB')
            INNER JOIN wuerp_vnrd.dbo.ta_productmst d ON a.mat_code = d.mat_code
            WHERE LEFT(a.mo_no, 8) = '14A08A00' AND LEFT(EPC_Code, 3) = 'E28'
            ORDER BY a.EPC_Code DESC, a.mo_no DESC, size_code ASC
            OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY
        `)
	}
}
