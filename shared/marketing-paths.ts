import { blogPosts } from '#shared/blog-posts.ts'
import { sitePaths } from '#shared/site-chrome.ts'

/** Paths listed in sitemap.xml (minimal SEO surface). */
export function getMarketingSitemapPaths(): Array<string> {
	return [
		'/',
		sitePaths.howItWorks,
		sitePaths.features,
		sitePaths.blog,
		...blogPosts.map((post) => `/blog/${post.slug}`),
		sitePaths.privacy,
		sitePaths.terms,
		sitePaths.aboutMcp,
		sitePaths.pricing,
	]
}
