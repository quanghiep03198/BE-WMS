import { fileTypeFromBuffer } from 'file-type/node'
import { Types } from 'mongoose'
import { Readable } from 'node:stream'
import sanitizeHtml from 'sanitize-html'
import { decodeDescription } from './description-codec'
import { FilesService, MAX_IMAGE_SIZE } from './files.service'
import { HtmlSanitizerService } from './html-sanitizer.service'

export async function migrateLegacyDescription(
	description: string | Buffer,
	owner: Types.ObjectId | null,
	files: Pick<FilesService, 'upload'>,
	sanitizer: HtmlSanitizerService,
	dryRun = false
): Promise<{ html: string; imageIds: string[] }> {
	const html = await decodeDescription(description)
	const sources = new Set<string>()
	sanitizeHtml(html, {
		allowedTags: false,
		allowedAttributes: false,
		allowVulnerableTags: true,
		transformTags: {
			img: (tagName, attribs) => {
				if (/^data:/i.test(attribs.src ?? '')) sources.add(attribs.src)
				return { tagName, attribs }
			}
		}
	})
	const replacements = new Map<string, string>()
	for (const source of sources) {
		const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([a-z0-9+/]+={0,2})$/i.exec(source)
		if (!match || match[1].length % 4 !== 0) throw new Error('Unsupported embedded image')
		const image = Buffer.from(match[1], 'base64')
		if (!image.length || image.length > MAX_IMAGE_SIZE || image.toString('base64') !== match[1]) {
			throw new Error('Invalid or oversized embedded image')
		}
		const detected = await fileTypeFromBuffer(image)
		if (!detected || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(detected.mime)) {
			throw new Error('Unsupported embedded image')
		}
		if (!owner) throw new Error('Missing image owner')
		const url = dryRun ? '/files/000000000000000000000000' : (await files.upload(Readable.from(image), owner)).url
		replacements.set(source, url)
	}
	const replaced = sanitizeHtml(html, {
		allowedTags: false,
		allowedAttributes: false,
		allowVulnerableTags: true,
		transformTags: {
			img: (tagName, attribs) => ({
				tagName,
				attribs: { ...attribs, src: replacements.get(attribs.src) ?? attribs.src }
			})
		}
	})
	return sanitizer.sanitize(replaced)
}
