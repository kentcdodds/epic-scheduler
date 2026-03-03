export function getShareToken(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length < 3) return ''
	return segments[2] ?? ''
}

export function isRecordValue(
	value: unknown,
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}
