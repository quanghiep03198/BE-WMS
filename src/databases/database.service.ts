import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DATA_SOURCE_ERP } from './constants'

@Injectable()
export class DatabaseService {
	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	async createNormalizeSizeMssqlFn() {
		await this.dataSourceERP.query(/* SQL */ `
			IF NOT EXISTS (SELECT 1
								FROM   sys.objects
								WHERE  object_id = OBJECT_ID(N'dbo.NORMALIZE_SIZE_NUMBER')
										AND type = N'FN')
				BEGIN
					EXECUTE ('CREATE FUNCTION dbo.NORMALIZE_SIZE_NUMBER() RETURNS NVARCHAR(50) AS BEGIN RETURN NULL END');
				END
			`)

		await this.dataSourceERP.query(/* SQL */ `
			ALTER FUNCTION dbo.NORMALIZE_SIZE_NUMBER
			(@size NVARCHAR (50))
			RETURNS NVARCHAR (50)
			AS
			BEGIN
				IF @size IS NULL
					RETURN NULL;
				DECLARE @clean AS NVARCHAR (50) = N'';
				DECLARE @i AS INT = 1;
				DECLARE @ch AS NCHAR (1);
				-- Remove all characters that are not 0-9, '.' or '-'
				WHILE @i <= LEN(@size)
					BEGIN
							SET @ch = SUBSTRING(@size, @i, 1);
							IF (@ch >= '0'
								AND @ch <= '9')
								OR @ch = '.'
								OR @ch = '-'
								SET @clean += @ch;
							SET @i += 1;
					END
				IF @clean IS NULL
					OR @clean = ''
					OR @clean = '.'
					OR @clean = '-'
					RETURN NULL;
				DECLARE @num AS FLOAT = TRY_CAST (@clean AS FLOAT);
				IF @num IS NULL
					RETURN NULL;
				DECLARE @result AS NVARCHAR (50) = CAST (@num AS NVARCHAR (50));
				IF @num < 10
					SET @result = N'0' + @result;
				RETURN @result;
			END
			`)
	}
}
