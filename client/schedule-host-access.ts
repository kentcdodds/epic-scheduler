const hostAccessTokenPrefix = 'schedule-host-token:'

function getHostAccessTokenStorageKey(shareToken: string) {
	return `${hostAccessTokenPrefix}${shareToken}`
}

export function readHostAccessToken(shareToken: string) {
	if (typeof window === 'undefined') return null
	return window.localStorage.getItem(getHostAccessTokenStorageKey(shareToken))
}

export function writeHostAccessToken(
	shareToken: string,
	hostAccessToken: string,
) {
	if (typeof window === 'undefined') return
	window.localStorage.setItem(
		getHostAccessTokenStorageKey(shareToken),
		hostAccessToken,
	)
}
