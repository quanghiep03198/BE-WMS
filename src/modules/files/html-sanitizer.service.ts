import { Injectable } from '@nestjs/common'
import sanitizeHtml from 'sanitize-html'

const IMAGE_SRC = /^\/files\/([a-f0-9]{24})$/
const SAFE_FONT_FAMILY =
	/^\s*(?:(?:"[\p{L}\p{N}\s._-]+"|'[\p{L}\p{N}\s._-]+'|[\p{L}_-][\p{L}\p{N}._-]*)(?:\s*,\s*(?:"[\p{L}\p{N}\s._-]+"|'[\p{L}\p{N}\s._-]+'|[\p{L}_-][\p{L}\p{N}._-]*))*)\s*$/u

@Injectable()
export class HtmlSanitizerService {
	sanitize(input: string): { html: string; imageIds: string[] } {
		const imageIds = new Set<string>()
		const html = sanitizeHtml(input, {
			allowedTags: [
				'p',
				'br',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'blockquote',
				'pre',
				'code',
				'strong',
				'b',
				'em',
				'i',
				's',
				'u',
				'del',
				'hr',
				'ul',
				'ol',
				'li',
				'a',
				'img',
				'figure',
				'figcaption',
				'table',
				'thead',
				'tbody',
				'tfoot',
				'tr',
				'th',
				'td',
				'span',
				'mark',
				'label',
				'input'
			],
			allowedAttributes: {
				'*': ['class'],
				p: ['style'],
				h1: ['style'],
				h2: ['style'],
				h3: ['style'],
				h4: ['style'],
				h5: ['style'],
				h6: ['style'],
				a: ['href', 'target', 'rel', 'title'],
				img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'style', 'align', 'caption', 'aspectratio'],
				figure: ['data-type'],
				table: ['style'],
				th: ['colspan', 'rowspan', 'colwidth', 'data-colwidth', 'style'],
				td: ['colspan', 'rowspan', 'colwidth', 'data-colwidth', 'style'],
				span: ['style'],
				mark: ['data-color', 'style'],
				ul: ['data-type'],
				li: ['data-type', 'data-checked'],
				input: ['type', 'checked', 'disabled']
			},
			allowedSchemes: ['http', 'https', 'mailto', 'tel'],
			allowProtocolRelative: false,
			allowedStyles: {
				'*': {
					'text-align': [/^(?:left|right|center|justify)$/],
					color: [/^#[a-f0-9]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]+$/i],
					'background-color': [/^#[a-f0-9]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]+$/i],
					'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
					'font-family': [SAFE_FONT_FAMILY],
					'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
					'font-style': [/^(?:normal|italic|oblique)$/],
					'text-decoration': [/^(?:none|underline|line-through|overline)$/],
					width: [/^\d+(?:\.\d+)?(?:px|%)$/],
					height: [/^\d+(?:\.\d+)?(?:px|%)$/]
				}
			},
			transformTags: {
				a: (tagName, attribs) => {
					if (attribs.href && !/^(?:https?:|mailto:|tel:)/i.test(attribs.href)) delete attribs.href
					if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer'
					return { tagName, attribs }
				},
				img: (tagName, attribs) => {
					const match = IMAGE_SRC.exec(attribs.src ?? '')
					if (match) imageIds.add(match[1])
					return { tagName, attribs }
				}
			},
			exclusiveFilter: (frame) =>
				(frame.tag === 'img' && !IMAGE_SRC.test(frame.attribs.src ?? '')) ||
				(frame.tag === 'input' && frame.attribs.type !== 'checkbox')
		}).normalize('NFC')
		return { html, imageIds: [...imageIds] }
	}
}
