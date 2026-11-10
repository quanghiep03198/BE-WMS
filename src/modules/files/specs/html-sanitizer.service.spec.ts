import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { decodeDescription } from '../description-codec'
import { HtmlSanitizerService } from '../html-sanitizer.service'

describe('HtmlSanitizerService', () => {
	const sanitizer = new HtmlSanitizerService()

	it('removes scripts and invalid images and extracts unique valid image ids', () => {
		const id = '0123456789abcdef01234567'
		const result = sanitizer.sanitize(
			`<p>Hello<script>alert(1)</script><img src="data:image/png;base64,abc"><img src="https://evil.test/image"><img src="/files/${id}"><img src="/files/${id}"></p>`
		)
		expect(result.html).not.toContain('script')
		expect(result.html).not.toContain('alert')
		expect(result.html).not.toContain('data:image')
		expect(result.html).not.toContain('evil.test')
		expect(result.html).toContain(`src="/files/${id}"`)
		expect(result.imageIds).toEqual([id])
	})

	it('rejects unsafe and relative links', () => {
		const result = sanitizer.sanitize(
			'<a href="javascript:alert(1)">x</a><a href="/relative">y</a><a href="https://example.com">z</a>'
		)
		expect(result.html).not.toContain('javascript')
		expect(result.html).not.toContain('/relative')
		expect(result.html).toContain('https://example.com')
	})

	it('preserves the frontend figure and caption markup', () => {
		const id = '0123456789abcdef01234567'
		const result = sanitizer.sanitize(
			`<figure data-type="figure"><img src="/files/${id}" width="100%" align="center"><figcaption>Caption</figcaption></figure>`
		)
		expect(result.html).toContain('<figure data-type="figure">')
		expect(result.html).toContain('<figcaption>Caption</figcaption>')
		expect(result.imageIds).toEqual([id])
	})

	it('preserves Vietnamese and Chinese text and safe font formatting', () => {
		const input =
			'<p style="text-align: center"><span style="font-family: Arial, \'Noto Sans CJK SC\', sans-serif; font-size: 16px; color: #123456">Tiếng Việt có dấu — 中文字符</span></p>'
		const result = sanitizer.sanitize(input)

		expect(result.html).toContain('Tiếng Việt có dấu — 中文字符')
		expect(result.html).toContain("font-family:Arial, 'Noto Sans CJK SC', sans-serif")
		expect(result.html).toContain('font-size:16px')
		expect(result.html).toContain('color:#123456')
		expect(result.html).toContain('text-align:center')
	})

	it('rejects unsafe font-family CSS while preserving text', () => {
		const result = sanitizer.sanitize(
			'<p><span style="font-family: url(javascript:alert(1)); background-image: url(javascript:alert(1))">Xin chào 中文</span></p>'
		)

		expect(result.html).toContain('Xin chào 中文')
		expect(result.html).not.toContain('font-family')
		expect(result.html).not.toContain('background-image')
	})
})

describe('decodeDescription', () => {
	it('reads legacy base64 and buffer gzip and preserves plain HTML', async () => {
		const html = '<p>Xin chào</p>'
		const compressed = await promisify(gzip)(html)
		await expect(decodeDescription(compressed)).resolves.toBe(html)
		await expect(decodeDescription(compressed.toString('base64'))).resolves.toBe(html)
		await expect(decodeDescription(html)).resolves.toBe(html)
	})
})
