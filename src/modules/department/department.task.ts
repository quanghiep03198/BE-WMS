import { Languages } from '@common/constants'
import { DATA_SOURCE_SYSCLOUD, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { LeanDocument } from 'mongoose'
import { I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'
import { DepartmentGroup } from './constants'
import { Department, DepartmentDocument, DepartmentModel } from './schemas/department.schema'

@Injectable()
export class DepartmentTask {
	constructor(
		@InjectPinoLogger(DepartmentTask.name) private readonly logger: PinoLogger,
		@InjectDataSource(DATA_SOURCE_SYSCLOUD) private readonly mssqlManager: DataSource,
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departmentModel: DepartmentModel,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService<ProcessEnv>
	) {}

	@Cron(CronExpression.EVERY_5_MINUTES)
	async handle() {
		const factory = this.configService.get<FactoryCode>('APP_TENANCY')
		const departments = await this.mssqlManager.query<LeanDocument<DepartmentDocument & { name: string }>[]>(
			/* SQL */ `
            WITH   assembly_cte
            AS     (SELECT 'ASBL' AS [group],
                           CASE WHEN dept_name LIKE '成型%' THEN REPLACE(LEFT(dept_name, 4), '線', '') WHEN dept_name LIKE '二廠成型%' THEN REPLACE(LEFT(dept_name, 5), '線', '') ELSE NULL END AS [name],
                           dept_code AS [code],
                           ROW_NUMBER() OVER (PARTITION BY REPLACE(LEFT(dept_name, 4), '線', '') ORDER BY dept_code DESC) AS [row_num]
                  FROM   syscloud_vn.dbo.ts_dept
                  WHERE  company_code = @0
                           AND (dept_code LIKE @0 + 'BA%'
                              OR dept_code LIKE @0 + 'BS%')
                           AND (dept_name LIKE '成型[A-Z]'
                              OR dept_name LIKE '成型[A-Z]線'
                              OR dept_name LIKE '成型[0-9][A-Z]'
                              OR dept_name LIKE '二廠成型%')),
                  reduced_assembly_cte
            AS     (SELECT [group],
                           [name],
                           [code]
                  FROM   assembly_cte
                  WHERE  row_num = 1
                           AND len([name]) >= 3),
                  reduced_sewing_cte
            AS     (SELECT   DISTINCT dept_name AS name,
                                    min(dept_code) AS code,
                                    'SEW' AS [group]
                  FROM     syscloud_vn.dbo.ts_dept
                  WHERE    company_code = @0
                           AND (dept_name LIKE '%針車[0-9]%')
                  GROUP BY dept_name)
            SELECT [group],
                  [code],
                  [name]
            FROM   reduced_assembly_cte
            UNION ALL
            SELECT [group],
                  [code],
                  [name]
            FROM   reduced_sewing_cte;
         `,
			[factory]
		)

		const departmentGroupMap = {
			[DepartmentGroup.ASSEMBLY]: 'assembly',
			[DepartmentGroup.SEWING]: 'sewing'
		}

		const result = await this.departmentModel.bulkWrite(
			departments.map((dept) => ({
				updateOne: {
					filter: { group: dept.group, code: dept.code },
					update: {
						$set: {
							...dept,
							name: Object.values(Languages).reduce(
								(acc, lang) => {
									acc[lang] = this.i18nService.t(`factory.departments.${departmentGroupMap[dept.group]}`, {
										args: { name: dept.name.replace(/[^A-Za-z0-9]/g, '') },
										lang
									})
									return acc
								},
								{} as Record<'vi' | 'en' | 'cn', string>
							)
						}
					},
					upsert: true
				}
			}))
		)

		this.logger.info(`${result.upsertedCount} departments upserted`)
	}
}
