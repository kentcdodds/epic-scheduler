import { type Handle } from 'remix/component'
import { clientRoutes } from './routes/index.tsx'
import {
	getPathname,
	listenToRouterNavigation,
	Router,
} from './client-router.tsx'
import {
	isFooterNavHrefActive,
	isPrimaryNavHrefActive,
	siteFooterLinks,
	sitePrimaryNavLinks,
} from '#shared/site-chrome.ts'
import { colors, mq, spacing, typography } from './styles/tokens.ts'
import { visuallyHiddenCss } from './styles/visually-hidden.ts'

function getRouteAnnouncement(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length === 0) return 'Create schedule page loaded.'
	if (segments[0] === 's' && segments.length >= 3)
		return 'Host dashboard loaded.'
	if (segments[0] === 's' && segments.length >= 2) {
		return 'Schedule availability page loaded.'
	}
	if (segments[0] === 'how-it-works') return 'How it works page loaded.'
	if (segments[0] === 'meeting-scheduler-features')
		return 'Features page loaded.'
	if (segments[0] === 'blog' && segments.length >= 2)
		return 'Blog post page loaded.'
	if (segments[0] === 'blog') return 'Blog page loaded.'
	if (segments[0] === 'privacy') return 'Privacy page loaded.'
	if (segments[0] === 'terms') return 'Terms page loaded.'
	if (segments[0] === 'about-mcp') return 'About MCP page loaded.'
	if (segments[0] === 'pricing') return 'Pricing page loaded.'
	if (segments[0] === 'support') return 'Support page loaded.'
	return 'Page content loaded.'
}

function focusMainContentHeading() {
	if (typeof document === 'undefined') return
	const heading = document.querySelector('#main-content h1')
	if (heading instanceof HTMLElement) {
		if (!heading.hasAttribute('tabindex')) {
			heading.setAttribute('tabindex', '-1')
		}
		heading.focus()
		return
	}
	const mainContent = document.getElementById('main-content')
	if (mainContent instanceof HTMLElement) {
		mainContent.focus()
	}
}

export function App(handle: Handle) {
	let pendingRouteA11ySync = true
	let shouldMoveFocusToMainContent = false
	let lastAnnouncedPath = ''
	let routeAnnouncement = ''

	listenToRouterNavigation(handle, (navigationType) => {
		pendingRouteA11ySync = true
		shouldMoveFocusToMainContent = navigationType !== 'pop'
		void handle.update()
	})

	handle.queueTask(() => {
		if (!pendingRouteA11ySync) return
		pendingRouteA11ySync = false
		if (typeof window === 'undefined') return
		const pathname = window.location.pathname
		if (pathname !== lastAnnouncedPath) {
			lastAnnouncedPath = pathname
			routeAnnouncement = getRouteAnnouncement(pathname)
			void handle.update()
		}
		if (shouldMoveFocusToMainContent) {
			shouldMoveFocusToMainContent = false
			focusMainContentHeading()
		}
	})

	const navLinkCss = {
		color: colors.primaryText,
		fontWeight: typography.fontWeight.medium,
		textDecoration: 'none',
		'&:hover': {
			textDecoration: 'underline',
		},
	}

	const skipToMainLinkCss = {
		position: 'absolute',
		left: spacing.sm,
		top: spacing.sm,
		padding: `${spacing.xs} ${spacing.sm}`,
		borderRadius: spacing.xs,
		border: `1px solid ${colors.border}`,
		backgroundColor: colors.surface,
		color: colors.text,
		textDecoration: 'none',
		transform: 'translateY(-150%)',
		transition: 'transform 120ms ease',
		zIndex: 100,
		'&:focus-visible': {
			transform: 'translateY(0)',
		},
	}

	return () => {
		const pathname = getPathname()
		return (
			<div
				css={{
					display: 'flex',
					flexDirection: 'column',
					minHeight: '100dvh',
					maxWidth: 'var(--content-max-width)',
					margin: '0 auto',
					padding: spacing['2xl'],
					fontFamily: typography.fontFamily,
					[mq.mobile]: {
						padding: `calc(${spacing['2xl']} / 2)`,
					},
				}}
			>
				<a href="#main-content" css={skipToMainLinkCss}>
					Skip to main content
				</a>
				<p role="status" aria-live="polite" css={visuallyHiddenCss}>
					{routeAnnouncement}
				</p>
				<header>
					<nav
						aria-label="Primary"
						css={{
							display: 'flex',
							gap: spacing.lg,
							flexWrap: 'wrap',
							alignItems: 'center',
							justifyContent: 'space-between',
							marginBottom: spacing.xl,
						}}
					>
						<a
							href="/"
							css={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: spacing.xs,
								textDecoration: 'none',
							}}
							aria-label="Epic Scheduler home"
						>
							<img
								src="/epic-scheduler-favicon.svg"
								alt=""
								aria-hidden="true"
								css={{
									width: '1.5rem',
									height: '1.5rem',
									borderRadius: '0.45rem',
								}}
							/>
							<span
								css={{
									color: colors.text,
									fontWeight: typography.fontWeight.semibold,
								}}
							>
								Epic Scheduler
							</span>
						</a>
						<div css={{ display: 'inline-flex', gap: spacing.md }}>
							{sitePrimaryNavLinks.map((link) => (
								<a
									key={link.href}
									href={link.href}
									css={{
										...navLinkCss,
										...(isPrimaryNavHrefActive(link.href, pathname)
											? {
													fontWeight: typography.fontWeight.semibold,
												}
											: {}),
									}}
								>
									{link.label}
								</a>
							))}
						</div>
					</nav>
				</header>
				<main id="main-content" tabIndex={-1} css={{ flex: '1 1 auto' }}>
					<Router
						setup={{
							routes: clientRoutes,
							fallback: (
								<section>
									<h2
										css={{
											fontSize: typography.fontSize.lg,
											fontWeight: typography.fontWeight.semibold,
											marginBottom: spacing.sm,
											color: colors.text,
										}}
									>
										Not Found
									</h2>
									<p css={{ color: colors.textMuted }}>
										That route does not exist.
									</p>
								</section>
							),
						}}
					/>
				</main>
				<footer
					css={{
						marginTop: spacing.xl,
						paddingTop: spacing.md,
						borderTop: `1px solid ${colors.border}`,
						display: 'flex',
						flexWrap: 'wrap',
						gap: spacing.md,
					}}
				>
					{siteFooterLinks.map((link) => (
						<a
							key={link.href}
							href={link.href}
							css={{
								...navLinkCss,
								...(isFooterNavHrefActive(link.href, pathname)
									? {
											fontWeight: typography.fontWeight.semibold,
										}
									: {}),
							}}
						>
							{link.label}
						</a>
					))}
				</footer>
			</div>
		)
	}
}
