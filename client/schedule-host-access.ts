const hostAccessTokenPrefix = 'schedule-host-token:'

function getHostAccessTokenStorageKey(shareToken: string) {
	return `${hostAccessTokenPrefix}${shareToken}`
}

export function readHostAccessToken(shareToken: string) {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(getHostAccessTokenStorageKey(shareToken))
	} catch {
		return null
	}
}

export function writeHostAccessToken(
	shareToken: string,
	hostAccessToken: string,
) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(
			getHostAccessTokenStorageKey(shareToken),
			hostAccessToken,
		)
	} catch {
		// no-op: storage unavailable in this environment
	}
}
