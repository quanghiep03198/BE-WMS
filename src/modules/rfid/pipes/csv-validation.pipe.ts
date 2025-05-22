import { PipeTransform, UnprocessableEntityException } from '@nestjs/common'

export class CsvFileValidationPipe implements PipeTransform {
	transform({ files }: { files: Express.Multer.File[] }) {
		if (!files || files.length === 0) {
			throw new Error('No files uploaded')
		}

		const isValid = files.every((file) => file.mimetype === 'text/csv')
		if (!isValid) {
			throw new UnprocessableEntityException('File type is not valid')
		}

		const isSizeValid = files.every((file) => file.size <= 10 * 1024 * 1024)
		if (!isSizeValid) {
			throw new UnprocessableEntityException('File size is too large')
		}

		return files
	}
}
