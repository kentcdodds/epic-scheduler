import { type Handle } from 'remix/component'
import { clientRoutes } from './routes/index.tsx'
import { listenToRouterNavigation, Router } from './client-router.tsx'
import { colors, spacing, typography } from './styles/tokens.ts'

export function App(handle: Handle) {
	listenToRouterNavigation(handle, () => {
		void handle.update()
	})

	const navLinkCss = {
		color: colors.primaryText,
		fontWeight: typography.fontWeight.medium,
		textDecoration: 'none',
		'&:hover': {
			textDecoration: 'underline',
		},
	}

	return () => {
		return (
			<main
				css={{
					maxWidth: '52rem',
					margin: '0 auto',
					padding: spacing['2xl'],
					fontFamily: typography.fontFamily,
				}}
			>
				<nav
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
						<a href="/" css={navLinkCss}>
							New schedule
						</a>
						<a href="/chat" css={navLinkCss}>
							Why this works
						</a>
					</div>
				</nav>
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
		)
	}
}
