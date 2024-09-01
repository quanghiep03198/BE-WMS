import { DynamicDataSourceService } from '@/common/services/dynamic-datasource.service'
import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

@Injectable()
export class DynamicDataSourceMiddleware implements NestMiddleware {
	constructor(private readonly dynamicDataSourceService: DynamicDataSourceService) {}

	use(req: Request, _res: Response, next: NextFunction) {
		const dataSource = this.dynamicDataSourceService.getDataSource()
		req['dataSource'] = dataSource // Gán DataSource cho request
		next()
	}
}
