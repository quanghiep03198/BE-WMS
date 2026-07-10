/* eslint-disable @typescript-eslint/no-unused-vars */
import { DefectiveGoodsEntity } from '@modules/defective-goods/entities/defective-goods.entity'
import { DataSource } from 'typeorm'
import { Seeder, SeederFactoryManager } from 'typeorm-extension'

export class DefectiveGoodsSeeder implements Seeder {
	track = true

	public async run(dataSource: DataSource, _factoryManager: SeederFactoryManager): Promise<any> {
		const repository = dataSource.getRepository(DefectiveGoodsEntity)
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
                'H4sIAAAAAAAAA+2YQW/TMBSA/8ojEmhITdJuO5U0EpyYGCcmLlM1uY7bmDqJFTtdy43TxIEDJw4IQdkBTQJpEpOQ2gOHoP2P/BNe0pS167RNgnJKKyWx3/PLs9/nZzuOvwVUEKVaRjcKtdmJhAeaDbXZjWLWi6Mk9Ay3YcFulE3GHEQ2fcdB+ulYg8+z6VHo2P6W6yRibkZwpc0wChlIs26ARzQx9UiylqGJ6u+i1HAdwefqgVmH/XskkA8OZLu5UBKkw0S7KQWhzKToG0P3KF5YfKUK1yxQlxTQomDE42HPjJkgQ+YtSIjgvdAMuOcJBl3BhjAz0SGKCY7+L7/FN7tcz+t4KBO9X3SL+oz2O9Gw3W7ikAXmvHyTKk1UM849q99aM+p2FdM3NSiiR6jmA3a9YhCbm9drFOG/GLSrle4o/pKZ22WoCwHzECciFFuJ/w4OcR7/fExdpzAIM+ncIkqVJKHr2OWt1PX4wHXkH2xGZsNw9+Js8mUEw/PTbPqeQiebvoIgm/zQ+Fp7kE2OuWNLNFG0tQWvwKvA+yfgPYrCHvRZBDb42fRj/liRVpG2BtKeEQ5B+ilB0kREkLq8ULFWsbYG1naLzd2vt/ly+iFHjYxgA3d8R9SvQSfBGorZ7nUNvPPT2eP9isSKxHWsr9nkJETO0m+hD7iR+6lxc4dV0PfTM+RQkKTk9JhWCFYIri0Z5sOOGI6RuTIT4uE3Cmq4DJ9EtTmONP0cVqmw4nCdizImQdgI0u+yRC/Mpie6Biq/5YfeaQVgBeA6AHzip2PaBMuyLgNmJ9jkVh8QNy14mp6BzibHuHHkoHmxphdfE6/8gOhxRVfNLCB9SQYItbHiuvVff7PhWZ55lZt/7+btMduy4HH6FbeMyBleA44XPKa8ITPGuryXxGxxtsxqsKs86IGKacvwtZaqadskxL+yBqF9KOeZ0U4knsE9Zcs4Onj4vF5vNLYPNq0XsmcAEbpl7ASkh9PxkHvabxmNev1uLsAMiDOvyJkGUCI1j7BijymNUiUZ1THBOmxgFD6WKkuxKVNu8RwkmnlL/c5tOfZFU7coYM9WYpiP6m9okIyA9BcAAA==' AS defective_description

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
