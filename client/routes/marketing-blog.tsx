import { type Handle } from 'remix/component'
import { setDocumentTitle, toAppTitle } from '#client/document-title.ts'
import { getPathname } from '#client/client-router.tsx'
import { getBlogPostBySlug, getBlogPosts } from '#shared/blog-posts.ts'

function parseBlogSlug(pathname: string) {
	const segments = pathname.split('/').filter(Boolean)
	if (segments.length !== 2) return null
	if (segments[0] !== 'blog') return null
	return segments[1] ?? null
}

export function BlogIndexRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Scheduling blog'))
		const posts = getBlogPosts()
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Resources</p>
					<h1>Scheduling guides for practical teams</h1>
					<p>
						Short, tactical reads for reducing meeting coordination overhead in
						distributed teams.
					</p>
				</header>
				<section className="seo-section seo-blog-list">
					{posts.map((post) => (
						<article key={post.slug}>
							<p className="seo-meta">
								{post.publishedDate} · {post.readingMinutes} min read
							</p>
							<h2>
								<a href={`/blog/${post.slug}`}>{post.title}</a>
							</h2>
							<p>{post.lede}</p>
						</article>
					))}
				</section>
			</main>
		)
	}
}

export function BlogPostRoute(_handle: Handle) {
	return () => {
		const slug = parseBlogSlug(getPathname())
		const post = slug ? getBlogPostBySlug(slug) : null
		if (!post) {
			setDocumentTitle(toAppTitle('Page not found'))
			return (
				<section className="seo-page">
					<div className="seo-section">
						<h1>Page not found</h1>
						<p>The post you requested does not exist.</p>
						<p>
							<a href="/blog">Back to blog</a>
						</p>
					</div>
				</section>
			)
		}

		setDocumentTitle(toAppTitle(post.title))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Blog</p>
					<h1>{post.title}</h1>
					<p>{post.lede}</p>
				</header>
				<article className="seo-section seo-blog-post">
					<p className="seo-meta">
						{post.publishedDate} · {post.readingMinutes} min read
					</p>
					<div
						className="seo-blog-post-html"
						{...({
							dangerouslySetInnerHTML: { __html: post.bodyHtml },
						} as Record<string, unknown>)}
					/>
					<p>
						<a href="/blog">Back to all posts</a>
					</p>
				</article>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Want to apply this process immediately? Create a live scheduling
						link.
					</p>
				</footer>
			</main>
		)
	}
}
