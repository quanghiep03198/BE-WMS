import crypto from 'crypto'

export function generateCacheKey(filterObject) {
	// 1. Sắp xếp các key của Object để đảm bảo tính đồng nhất
	const sortedFilter = Object.keys(filterObject)
		.sort()
		.reduce((acc, key) => {
			acc[key] = filterObject[key]
			return acc
		}, {})

	// 2. Chuyển thành chuỗi
	const filterString = JSON.stringify(sortedFilter)

	// 3. Tạo mã MD5 hash làm Key cho Redis
	const hash = crypto.createHash('md5').update(filterString).digest('hex')

	return hash
}
