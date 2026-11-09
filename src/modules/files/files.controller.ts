import { RequestUser, RequireAuthenticated } from '@common/decorators'
import { BadRequestException, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { Types } from 'mongoose'
import { FilesService, MAX_IMAGE_SIZE } from './files.service'

@Controller()
export class FilesController {
	constructor(private readonly files: FilesService) {}

	@Post('uploads/images')
	@RequireAuthenticated()
	async upload(@Req() request: FastifyRequest, @RequestUser('_id') ownerId: Types.ObjectId) {
		const part = await request.file({ limits: { files: 1, fileSize: MAX_IMAGE_SIZE + 1 } })
		if (part?.fieldname !== 'file') {
			part?.file.resume()
			throw new BadRequestException('A file field is required')
		}
		return this.files.upload(part.file, ownerId)
	}

	@Get('files/:id')
	@RequireAuthenticated()
	async download(@Param('id') id: string, @Headers('if-none-match') ifNoneMatch: string, @Res() reply: FastifyReply) {
		const { file, stream } = await this.files.download(id)
		const etag = `"${id}"`
		reply.header('ETag', etag).header('Cache-Control', 'private, max-age=31536000, immutable')
		if (ifNoneMatch?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag || tag.trim() === '*')) {
			return reply.status(304).send()
		}
		return reply.type(file.mimetype).send(stream())
	}
}
