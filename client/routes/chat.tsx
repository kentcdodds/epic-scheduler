import { type Handle } from 'remix/component'
import {
	colors,
	radius,
	shadows,
	spacing,
	typography,
} from '#client/styles/tokens.ts'

export function ChatRoute(_handle: Handle) {
	return () => (
		<section
			css={{
				display: 'grid',
				gap: spacing.lg,
				padding: spacing.lg,
				border: `1px solid ${colors.border}`,
				borderRadius: radius.lg,
				backgroundColor: colors.surface,
				boxShadow: shadows.sm,
			}}
		>
			<h2
				css={{
					fontSize: typography.fontSize.lg,
					fontWeight: typography.fontWeight.semibold,
					margin: 0,
					color: colors.text,
				}}
			>
				About Epic Scheduler
			</h2>
			<p css={{ margin: 0, color: colors.textMuted }}>
				This app is optimized for small-group scheduling across timezones with
				realtime overlap heatmaps, no accounts, and link-only collaboration.
			</p>
		</section>
	)
}
