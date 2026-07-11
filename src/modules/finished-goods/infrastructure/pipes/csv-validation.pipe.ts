import { StorageFile } from '@blazity/nest-file-fastify'
import { PipeTransform, UnprocessableEntityException } from '@nestjs/common'

export class CsvFileValidationPipe implements PipeTransform {
	transform({ files }: { files: Array<StorageFile & { buffer: Buffer }> }) {
		if (!files || files.length === 0) {
			throw new Error('No files uploaded')
		}

		const isValid = files.every((file) => file.mimetype === 'text/csv')
		if (!isValid) {
			throw new UnprocessableEntityException('File type is not valid')
		}

		return files
	}
}
