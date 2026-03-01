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
				Why Epic Scheduler
			</h2>
			<p
				css={{
					margin: 0,
					color: colors.textMuted,
					maxWidth: '56ch',
				}}
			>
				Most scheduling friction is hidden in coordination messages. Epic
				Scheduler removes that overhead with one shareable grid where everyone
				paints availability in minutes.
			</p>
			<ul
				css={{
					margin: 0,
					paddingLeft: spacing.lg,
					display: 'grid',
					gap: spacing.xs,
					color: colors.textMuted,
				}}
			>
				<li>Share a single link with no account requirement.</li>
				<li>Watch overlap update live while responses come in.</li>
				<li>See exactly who can attend each slot before booking.</li>
			</ul>
			<p css={{ margin: 0, color: colors.textMuted }}>
				Use the homepage to create your next poll.
			</p>
		</section>
	)
}
