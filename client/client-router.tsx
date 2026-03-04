import { type Handle } from 'remix/component'
import { setDocumentTitle, toAppTitle } from './document-title.ts'

type RouterSetup = {
	routes: Record<string, JSX.Element>
	fallback?: JSX.Element
}

type FormMethod = 'get' | 'post'

type FormSubmitDetails = {
	action: URL
	method: FormMethod
	enctype: string
	formData: FormData
}

type RouterNavigationType = 'pop' | 'push'

export const routerEvents = new EventTarget()
let routerInitialized = false
const scrollPositionsStorageKey = 'react-router-scroll-positions'
let hasLoadedScrollPositions = false
let scrollPositions: Record<string, number> = {}
let scrollSaveScheduled = false
let scrollSaveToken = 0
let skipScrollSave = false
let lastNavigationType: RouterNavigationType = 'push'

function createHistoryStateKey() {
	return Math.random().toString(32).slice(2)
}

function getHistoryStateObject() {
	if (typeof window === 'undefined') return {}
	const state = window.history.state
	if (state && typeof state === 'object') {
		return state as Record<string, unknown>
	}
	return {}
}

function getHistoryStateKey() {
	const key = getHistoryStateObject().key
	if (typeof key === 'string' && key.length > 0) return key
	return null
}

function ensureHistoryStateKey() {
	const existingKey = getHistoryStateKey()
	if (existingKey) return existingKey
	const key = createHistoryStateKey()
	window.history.replaceState({ ...getHistoryStateObject(), key }, '')
	return key
}

function loadScrollPositionsFromSessionStorage() {
	try {
		const parsed = JSON.parse(
			sessionStorage.getItem(scrollPositionsStorageKey) ?? '{}',
		)
		if (!parsed || typeof parsed !== 'object') {
			scrollPositions = {}
			return
		}

		scrollPositions = {}
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'number') {
				scrollPositions[key] = value
			}
		}
	} catch (error) {
		console.error(error)
		scrollPositions = {}
		sessionStorage.removeItem(scrollPositionsStorageKey)
	}
}

function getScrollPositions() {
	if (!hasLoadedScrollPositions) {
		loadScrollPositionsFromSessionStorage()
		hasLoadedScrollPositions = true
	}
	return scrollPositions
}

function persistScrollPositions() {
	try {
		sessionStorage.setItem(
			scrollPositionsStorageKey,
			JSON.stringify(getScrollPositions()),
		)
	} catch (error) {
		console.error(error)
	}
}

function saveCurrentScrollPosition(scrollKey: string | null = null) {
	if (typeof window === 'undefined') return
	const key = scrollKey ?? ensureHistoryStateKey()
	getScrollPositions()[key] = window.scrollY
	persistScrollPositions()
}

function scheduleScrollSave() {
	if (typeof window === 'undefined') return
	if (skipScrollSave) return
	if (scrollSaveScheduled) return
	scrollSaveScheduled = true
	const key = ensureHistoryStateKey()
	const token = scrollSaveToken
	window.requestAnimationFrame(() => {
		scrollSaveScheduled = false
		if (skipScrollSave) return
		if (token !== scrollSaveToken) return
		saveCurrentScrollPosition(key)
	})
}

function restoreScrollPosition(restoreKey: string | null = null) {
	if (typeof window === 'undefined') return
	const key = restoreKey ?? ensureHistoryStateKey()
	const storedY = getScrollPositions()[key]
	if (typeof storedY === 'number') {
		window.scrollTo(0, storedY)
	}
}

function getMaxScrollableY() {
	if (typeof window === 'undefined') return 0
	return Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

function restoreScrollPositionForPopstate(
	restoreKey: string | null,
	remainingFrames: number,
) {
	if (typeof window === 'undefined') return
	const key = restoreKey ?? ensureHistoryStateKey()
	const storedY = getScrollPositions()[key]
	if (typeof storedY !== 'number') {
		skipScrollSave = false
		return
	}

	restoreScrollPosition(key)
	const maxScrollableY = getMaxScrollableY()
	const canReachTarget = maxScrollableY >= storedY
	const reachedTarget = window.scrollY >= storedY - 1
	if (canReachTarget || reachedTarget || remainingFrames <= 0) {
		skipScrollSave = false
		return
	}

	window.requestAnimationFrame(() => {
		restoreScrollPositionForPopstate(key, remainingFrames - 1)
	})
}

function getPopStateEventKey(event: PopStateEvent) {
	const state = event.state
	if (!state || typeof state !== 'object') return null
	const key = (state as Record<string, unknown>).key
	if (typeof key === 'string' && key.length > 0) return key
	return null
}

function notify(navigationType: RouterNavigationType = 'push') {
	lastNavigationType = navigationType
	routerEvents.dispatchEvent(new Event('navigate'))
}

function compileRoutePattern(pattern: string) {
	const regexPattern = pattern
		.replace(/:([^/]+)/g, '([^/]+)')
		.replace(/\*/g, '.*')

	return {
		pattern: new RegExp(`^${regexPattern}$`),
	}
}

function matchRoute(
	path: string,
	routes: Record<string, JSX.Element>,
): JSX.Element | null {
	for (const [pattern, routeElement] of Object.entries(routes)) {
		const { pattern: compiled } = compileRoutePattern(pattern)
		const result = compiled.exec(path)
		if (!result) continue
		return routeElement
	}

	return null
}

function shouldHandleClick(event: MouseEvent, anchor: HTMLAnchorElement) {
	if (event.defaultPrevented) return false
	if (event.button !== 0) return false
	if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
		return false
	if (anchor.hasAttribute('data-router-reload')) return false
	if (anchor.target && anchor.target !== '_self') return false
	if (anchor.hasAttribute('download')) return false

	const href = anchor.getAttribute('href')
	if (!href || href.startsWith('#')) return false

	const destination = new URL(href, window.location.href)
	if (destination.origin !== window.location.origin) return false
	return true
}

function handleDocumentClick(event: MouseEvent) {
	const target = event.target as Element | null
	const anchor = target?.closest('a') as HTMLAnchorElement | null
	if (!anchor || typeof window === 'undefined') return
	if (!shouldHandleClick(event, anchor)) return

	event.preventDefault()
	const destination = new URL(anchor.href, window.location.href)
	navigate(`${destination.pathname}${destination.search}${destination.hash}`)
}

function getFormSubmitter(event: SubmitEvent) {
	const submitter = event.submitter
	if (
		submitter instanceof HTMLButtonElement ||
		submitter instanceof HTMLInputElement
	) {
		return submitter
	}
	return null
}

function normalizeFormMethod(rawMethod: string | null): FormMethod | null {
	const method = (rawMethod ?? 'get').trim().toLowerCase()
	if (method === 'get' || method === 'post') return method
	return null
}

function normalizeTarget(rawTarget: string | null) {
	return (rawTarget ?? '').trim().toLowerCase()
}

function createSubmitFormData(
	form: HTMLFormElement,
	submitter: HTMLButtonElement | HTMLInputElement | null,
) {
	return submitter ? new FormData(form, submitter) : new FormData(form)
}

function resolveFormSubmitDetails(
	form: HTMLFormElement,
	submitter: HTMLButtonElement | HTMLInputElement | null,
): FormSubmitDetails | null {
	const method = normalizeFormMethod(
		submitter?.getAttribute('formmethod') ?? form.getAttribute('method'),
	)
	if (!method) return null

	const target = normalizeTarget(
		submitter?.getAttribute('formtarget') ?? form.getAttribute('target'),
	)
	if (target && target !== '_self') return null

	const rawAction =
		submitter?.getAttribute('formaction') ?? form.getAttribute('action')
	const action = new URL(
		rawAction || window.location.href,
		window.location.href,
	)
	if (action.origin !== window.location.origin) return null

	const enctype = (
		submitter?.getAttribute('formenctype') ??
		form.getAttribute('enctype') ??
		'application/x-www-form-urlencoded'
	)
		.trim()
		.toLowerCase()

	return {
		action,
		method,
		enctype,
		formData: createSubmitFormData(form, submitter),
	}
}

function formDataToSearchParams(formData: FormData) {
	const params = new URLSearchParams()
	for (const [name, value] of formData.entries()) {
		params.append(name, getFormDataValueText(value))
	}
	return params
}

function formDataToPlainText(formData: FormData) {
	const lines: Array<string> = []
	for (const [name, value] of formData.entries()) {
		lines.push(`${name}=${getFormDataValueText(value)}`)
	}
	return lines.join('\r\n')
}

function getFormDataValueText(value: FormDataEntryValue) {
	if (typeof value === 'string') return value
	const fileName = (value as { name?: unknown }).name
	return typeof fileName === 'string' ? fileName : 'blob'
}

function buildGetDestination(action: URL, formData: FormData) {
	const destination = new URL(action.toString())
	destination.search = formDataToSearchParams(formData).toString()
	return destination
}

function getPathWithSearchAndHashFromUrl(url: URL) {
	return `${url.pathname}${url.search}${url.hash}`
}

function navigateWithRefreshForSamePath(destination: URL) {
	if (
		getPathWithSearchAndHashFromUrl(destination) ===
		getCurrentPathWithSearchAndHash()
	) {
		notify()
		return
	}
	navigate(destination.toString())
}

async function submitFormThroughRouter(details: FormSubmitDetails) {
	if (details.method === 'get') {
		navigate(buildGetDestination(details.action, details.formData).toString())
		return
	}

	const init: RequestInit = {
		method: details.method.toUpperCase(),
		credentials: 'include',
		redirect: 'follow',
	}

	if (details.enctype === 'application/x-www-form-urlencoded') {
		init.body = formDataToSearchParams(details.formData)
		init.headers = {
			'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
		}
	} else if (details.enctype === 'text/plain') {
		init.body = formDataToPlainText(details.formData)
		init.headers = {
			'Content-Type': 'text/plain;charset=UTF-8',
		}
	} else {
		init.body = details.formData
	}

	const response = await fetch(details.action.toString(), init)
	if (response.redirected) {
		navigateWithRefreshForSamePath(new URL(response.url, window.location.href))
		return
	}

	const location = response.headers.get('Location')
	if (location) {
		navigateWithRefreshForSamePath(new URL(location, details.action))
		return
	}

	throw new Error(
		`Expected redirect location after form submit (${response.status} ${response.statusText})`,
	)
}

function handleDocumentSubmit(event: Event) {
	if (!(event instanceof SubmitEvent)) return
	if (typeof window === 'undefined') return
	if (event.defaultPrevented) return
	if (!(event.target instanceof HTMLFormElement)) return
	if (event.target.hasAttribute('data-router-skip')) return

	const submitter = getFormSubmitter(event)
	const details = resolveFormSubmitDetails(event.target, submitter)
	if (!details) return

	event.preventDefault()
	void submitFormThroughRouter(details).catch((error: unknown) => {
		console.error('Router form submit failed', error)
	})
}

function ensureRouter() {
	if (routerInitialized) return
	routerInitialized = true
	if ('scrollRestoration' in window.history) {
		window.history.scrollRestoration = 'manual'
	}
	window.requestAnimationFrame(() => {
		skipScrollSave = true
		restoreScrollPositionForPopstate(null, 8)
	})
	window.addEventListener('scroll', scheduleScrollSave, { passive: true })
	window.addEventListener('pagehide', () => {
		saveCurrentScrollPosition()
	})
	window.addEventListener('popstate', (event) => {
		const restoreKey = getPopStateEventKey(event)
		skipScrollSave = true
		notify('pop')
		window.requestAnimationFrame(() => {
			restoreScrollPositionForPopstate(restoreKey, 8)
		})
	})
	document.addEventListener('click', handleDocumentClick)
	document.addEventListener('submit', handleDocumentSubmit)
}

export function listenToRouterNavigation(
	handle: Handle,
	listener: (navigationType: RouterNavigationType) => void,
) {
	ensureRouter()
	handle.on(routerEvents, {
		navigate: () => listener(lastNavigationType),
	})
}

export function getPathname() {
	if (typeof window === 'undefined') return '/'
	return window.location.pathname
}

function getCurrentPathWithSearchAndHash() {
	if (typeof window === 'undefined') return '/'
	return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function navigate(to: string) {
	if (typeof window === 'undefined') return
	const destination = new URL(to, window.location.href)
	if (destination.origin !== window.location.origin) {
		saveCurrentScrollPosition()
		window.location.assign(destination.toString())
		return
	}

	const nextPath = `${destination.pathname}${destination.search}${destination.hash}`
	if (nextPath === getCurrentPathWithSearchAndHash()) return

	const currentKey = ensureHistoryStateKey()
	const positions = getScrollPositions()
	const storedY = positions[currentKey]
	const scrollY =
		window.scrollY === 0 && typeof storedY === 'number' && !scrollSaveScheduled
			? storedY
			: window.scrollY
	positions[currentKey] = scrollY
	persistScrollPositions()
	scrollSaveToken += 1
	const nextKey = createHistoryStateKey()
	window.history.pushState({ key: nextKey }, '', nextPath)
	notify('push')
}

export function Router(handle: Handle, setup: RouterSetup) {
	listenToRouterNavigation(handle, () => {
		void handle.update()
	})

	return () => {
		const path = getPathname()
		const routeElement = matchRoute(path, setup.routes)
		if (routeElement) return routeElement
		setDocumentTitle(toAppTitle('Page not found'))
		return setup.fallback ?? null
	}
}
