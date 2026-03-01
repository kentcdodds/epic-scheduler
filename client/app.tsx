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
						gap: spacing.md,
						flexWrap: 'wrap',
						marginBottom: spacing.xl,
					}}
				>
					<a href="/" css={navLinkCss}>
						Create Schedule
					</a>
					<a href="/chat" css={navLinkCss}>
						About
					</a>
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
