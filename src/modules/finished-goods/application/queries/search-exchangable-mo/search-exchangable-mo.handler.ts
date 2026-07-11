import { DATA_SOURCE_ERP } from '@databases/constants'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { SearchExchangableMoQuery } from './search-exchangable-mo.query'

@QueryHandler(SearchExchangableMoQuery)
export class SearchExchangableMoHandler implements IQueryHandler<SearchExchangableMoQuery> {
	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	public async execute(query: SearchExchangableMoQuery) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 a.mo_no AS mo_no`)
			.addSelect(/* SQL */ `a.created`, 'created')
			.from('ta_manufacturmst', 'a')
			.leftJoin('ta_productmst', 'b', /* SQL */ `b.mat_code = a.mat_code AND b.isactive = 'Y'`)
			.leftJoin(
				'ta_shoefactorymst',
				'c',
				/* SQL */ `c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'`
			)
			.where(/* SQL */ `a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.andWhere(/* SQL */ `a.mo_no LIKE CONCAT('%',:search, '%')`)
			.andWhere(/* SQL */ `b.color_sn = :color`)
			.andWhere(
				/* SQL */ `(
					(:factoryCode = 'VA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'A') OR
					(:factoryCode = 'VB1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'B') OR
					(:factoryCode = 'VB2' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'C') OR
					(:factoryCode = 'CA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'D')
			  )`
			)
			// .andWhere(/* SQL */ `a.cofactory_code = :factoryCode`)
			.orderBy('a.mo_no', 'DESC')
			.addOrderBy('a.created', 'DESC')
			.setParameters({
				search: query.searchTerm,
				factoryCode: query.factoryCode,
				color: query.color
			})
			.getRawMany<{ mo_no: string; created: Date }>()
	}
}
