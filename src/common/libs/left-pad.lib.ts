export const leftPad = (str: string, len: number, ch: string | number): string => {
	str = str + ''

	len = len - str.length
	if (len <= 0) return str

	if (!ch && ch !== 0) ch = ' '
	ch = ch + ''

	while (len--) {
		str = ch + str
	}

	return str
}
