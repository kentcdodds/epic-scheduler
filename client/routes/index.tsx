import { BlogIndexRoute, BlogPostRoute } from './marketing-blog.tsx'
import {
	AboutMcpRoute,
	ContactRoute,
	FeaturesRoute,
	HowItWorksRoute,
	PricingRoute,
	PrivacyRoute,
	SupportRoute,
	TermsRoute,
} from './marketing-pages.tsx'
import { HomeRoute } from './home.tsx'
import { ScheduleRoute } from './schedule.tsx'
import { ScheduleHostRoute } from './schedule-host.tsx'

export const clientRoutes = {
	'/': <HomeRoute />,
	'/how-it-works': <HowItWorksRoute />,
	'/meeting-scheduler-features': <FeaturesRoute />,
	'/blog': <BlogIndexRoute />,
	'/blog/:slug': <BlogPostRoute />,
	'/contact': <ContactRoute />,
	'/privacy': <PrivacyRoute />,
	'/terms': <TermsRoute />,
	'/about-mcp': <AboutMcpRoute />,
	'/pricing': <PricingRoute />,
	'/support': <SupportRoute />,
	'/s/:shareToken/:hostAccessToken': <ScheduleHostRoute />,
	'/s/:shareToken': <ScheduleRoute />,
}
