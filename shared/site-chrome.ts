/**
 * Single source of truth for primary nav and footer links (app shell + marketing HTML).
 */
export const sitePaths = {
	home: '/',
	howItWorks: '/how-it-works',
	features: '/meeting-scheduler-features',
	blog: '/blog',
	aboutMcp: '/about-mcp',
	contact: '/contact',
	privacy: '/privacy',
	terms: '/terms',
	pricing: '/pricing',
	support: '/support',
} as const

export type SiteNavLink = {
	readonly href: string
	readonly label: string
}

export const supportEmail = 'support@epic-scheduler.com'

export const sitePrimaryNavLinks: ReadonlyArray<SiteNavLink> = [
	{ href: sitePaths.home, label: 'New schedule' },
	{ href: sitePaths.howItWorks, label: 'How it works' },
	{ href: sitePaths.blog, label: 'Blog' },
	{ href: sitePaths.aboutMcp, label: 'AI Ready' },
]

export const siteFooterLinks: ReadonlyArray<SiteNavLink> = [
	{ href: sitePaths.privacy, label: 'Privacy' },
	{ href: sitePaths.terms, label: 'Terms' },
	{ href: sitePaths.features, label: 'Features' },
	{ href: sitePaths.contact, label: 'Contact' },
	{
		href: sitePaths.pricing,
		label: "Price (it's free... really)",
	},
	{ href: sitePaths.support, label: 'Support' },
]

/** Active state for top nav (blog index + posts highlight “Blog”). */
export function isPrimaryNavHrefActive(
	href: string,
	pathname: string,
): boolean {
	if (href === sitePaths.home) return pathname === sitePaths.home
	return pathname === href || pathname.startsWith(`${href}/`)
}

export function isFooterNavHrefActive(href: string, pathname: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`)
}
