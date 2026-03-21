import { type Handle } from 'remix/component'
import { setDocumentTitle, toAppTitle } from '#client/document-title.ts'
import { supportContact } from '#shared/support-details.ts'
import { sitePaths } from '#shared/site-chrome.ts'

export function HowItWorksRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('How Epic Scheduler works'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Workflow</p>
					<h1>How Epic Scheduler keeps coordination simple</h1>
					<p>
						The goal is fewer messages and faster decisions. One link, visible
						overlap, and clear host ownership.
					</p>
				</header>
				<section className="seo-section">
					<h2>Fast host setup</h2>
					<p>
						Select day range, choose 15/30/60-minute slots, and paint your own
						availability with click-drag or tap start/end.
					</p>
				</section>
				<section className="seo-section">
					<h2>Host access link</h2>
					<p>
						When a schedule is created, Epic Scheduler issues a host access
						token (<code>hostAccessToken</code>) that lives in the host
						dashboard URL and <code>X-Host-Token</code> header. It is an
						app-generated capability scoped to that schedule, not a third-party
						password or external credential. Creating a new schedule rotates the
						token.
					</p>
				</section>
				<section className="seo-section">
					<h2>Inline demo: overlap heatmap</h2>
					<p>
						This simplified preview mirrors how slot intensity maps to attendee
						overlap.
					</p>
					<div
						className="seo-inline-demo"
						role="img"
						aria-label="Heatmap preview"
					>
						<div className="seo-demo-legend">
							<span>0</span>
							<span className="lv1">1</span>
							<span className="lv2">2</span>
							<span className="lv3">3+</span>
						</div>
						<div className="seo-demo-grid">
							<span className="lv0">8:00</span>
							<span className="lv1">9:00</span>
							<span className="lv2">10:00</span>
							<span className="lv3">11:00</span>
							<span className="lv1">12:00</span>
							<span className="lv0">13:00</span>
							<span className="lv2">14:00</span>
							<span className="lv3">15:00</span>
						</div>
					</div>
				</section>
				<section className="seo-section seo-card-grid">
					<article>
						<h3>Host clarity</h3>
						<p>
							Per-slot attendee names eliminate guesswork when selecting final
							times.
						</p>
					</article>
					<article>
						<h3>Attendee speed</h3>
						<p>
							No account creation. Open link, enter name, paint availability,
							done.
						</p>
					</article>
					<article>
						<h3>Realtime confidence</h3>
						<p>
							Updates sync instantly, with durable persistence to survive
							redeploys.
						</p>
					</article>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

export function FeaturesRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Meeting scheduler features'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Product</p>
					<h1>Feature set built for low-friction scheduling</h1>
					<p>
						Designed for hosts coordinating 4–8 people across timezones without
						heavy calendar integration.
					</p>
				</header>
				<section className="seo-section">
					<h2>Core features</h2>
					<ul>
						<li>
							Host-created share links with configurable interval granularity
						</li>
						<li>
							Paintable availability grid with drag and tap-range interactions
						</li>
						<li>Realtime overlap updates powered by Durable Objects</li>
						<li>D1-backed persistence so data survives app restarts</li>
						<li>Color-coded slot intensity and per-slot attendee names</li>
						<li>
							Public MCP tools for schedule creation and availability updates
						</li>
					</ul>
				</section>
				<section className="seo-section">
					<h2>Inline demo: attendee slot visibility</h2>
					<div className="seo-inline-demo">
						<div className="seo-chip-row">
							<span className="seo-chip">Mon 09:30 — Alex, Jordan, Sam</span>
							<span className="seo-chip">Mon 10:00 — Alex, Priya</span>
							<span className="seo-chip">Mon 10:30 — Jordan, Priya, Sam</span>
						</div>
					</div>
				</section>
				<section className="seo-section">
					<h2>Use-case fit</h2>
					<p>
						Epic Scheduler fits teams that need better coordination now and
						don’t want to maintain account systems, OAuth integrations, or
						calendar sync complexity in v1.
					</p>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

export function PrivacyRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Privacy policy'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Legal</p>
					<h1>Privacy policy</h1>
					<p>
						Epic Scheduler is intentionally minimal. We store only what is
						required to run shared scheduling links.
					</p>
				</header>
				<section className="seo-section">
					<h2>What we collect</h2>
					<ul>
						<li>Schedule metadata (range, interval, share token)</li>
						<li>Attendee display names</li>
						<li>Availability selections per slot</li>
					</ul>
					<p>
						We do not run account signups and do not intentionally collect
						sensitive personal profile data in v1.
					</p>
				</section>
				<section className="seo-section">
					<h2>How data is used</h2>
					<p>
						Data is used only to display and synchronize scheduling availability
						for link participants.
					</p>
				</section>
				<section className="seo-section">
					<h2>Retention and deletion</h2>
					<p>
						We may delete schedules, reset storage, or discontinue the project
						at any time. Do not treat this service as archival storage.
					</p>
				</section>
				<section className="seo-section">
					<h2>No security guarantees</h2>
					<p>
						Reasonable effort is made, but no uptime, durability, or security
						SLA is guaranteed.
					</p>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

export function TermsRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Terms of service'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Legal</p>
					<h1>Terms of service</h1>
					<p>
						By using Epic Scheduler you agree that the service is experimental
						and provided as-is.
					</p>
				</header>
				<section className="seo-section">
					<h2>Use at your own risk</h2>
					<p>
						The service is provided “as is,” with no guarantee of availability,
						error-free operation, or fitness for a specific purpose.
					</p>
				</section>
				<section className="seo-section">
					<h2>No uptime commitment</h2>
					<p>
						We may interrupt, change, or permanently shut down the project at
						any time without notice.
					</p>
				</section>
				<section className="seo-section">
					<h2>Data loss is possible</h2>
					<p>
						You acknowledge that schedules or attendee data may be removed,
						corrupted, or unavailable.
					</p>
				</section>
				<section className="seo-section">
					<h2>Acceptable use</h2>
					<p>
						Do not abuse the service with illegal activity, spam, or attempts to
						degrade availability for other users.
					</p>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

export function PricingRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Pricing'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Honest answer</p>
					<h1>No really, it&apos;s free</h1>
					<p>
						It&apos;s really cheap to host, and I had fun building it—so
						there&apos;s no pricing page with tiers, upsells, or a &quot;contact
						sales&quot; button. You just use it.
					</p>
				</header>
				<section className="seo-section">
					<h2>What &quot;free&quot; means here</h2>
					<p>
						No fee from this app for coordinating a few schedules. If you run
						your own deployment, you pay whatever your host charges for the
						underlying bits (often a few bucks or less at small scale). That
						still counts as free in the &quot;I&apos;m not buying scheduling
						software&quot; sense.
					</p>
				</section>
				<section className="seo-section">
					<h2>The tiny caveat</h2>
					<p>
						Services evolve, limits exist, and the internet is weird. Don&apos;t
						bet your company&apos;s survival on a hobby project—but for finding
						a meeting time with friends or a team, you&apos;re in the right
						place.
					</p>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

export function SupportRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('Support'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">Support</p>
					<h1>Need help with Epic Scheduler?</h1>
					<p>
						We keep support simple and async. Use the link below to reach the
						maintainer and track responses.
					</p>
				</header>
				<section className="seo-section">
					<h2>Contact</h2>
					<p>
						<a href={supportContact.url}>{supportContact.label}</a>
					</p>
					<p>{supportContact.description}</p>
				</section>
				<section className="seo-section">
					<h2>What to include</h2>
					<ul>
						<li>Share link or host dashboard URL (if applicable)</li>
						<li>Steps to reproduce the issue</li>
						<li>Expected vs actual behavior</li>
					</ul>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}

const mcpPath = '/mcp'

export function AboutMcpRoute(_handle: Handle) {
	return () => {
		setDocumentTitle(toAppTitle('About Epic Scheduler MCP'))
		return (
			<main className="seo-page">
				<header className="seo-hero">
					<p className="seo-eyebrow">AI Ready</p>
					<h1>About Epic Scheduler MCP</h1>
					<p>
						Epic Scheduler exposes a public MCP server so compatible clients
						(like ChatGPT and Claude) can create scheduling links, submit
						availability, and embed the scheduler UI.
					</p>
				</header>
				<section className="seo-section">
					<h2>What is MCP?</h2>
					<p>
						Model Context Protocol (MCP) is a way for AI agents to call tools
						and load resources from your app through a standard wire protocol.
					</p>
				</section>
				<section className="seo-section">
					<h2>What can I do with it?</h2>
					<p>With the Epic Scheduler MCP server you can:</p>
					<ul>
						<li>Create schedules and share links</li>
						<li>Submit attendee availability</li>
						<li>Read overlap snapshots</li>
						<li>
							Open attendee and host MCP app widgets when the host supports MCP
							Apps
						</li>
					</ul>
				</section>
				<section className="seo-section">
					<h2>Endpoint</h2>
					<p>
						Connect your MCP client to <code>{mcpPath}</code> on your deployment
						origin (for example <code>{`https://your-domain${mcpPath}`}</code>).
					</p>
				</section>
				<section className="seo-section">
					<h2>Cursor configuration</h2>
					<p>
						Add a remote MCP server in your Cursor MCP settings, for example:
					</p>
					<pre
						className="seo-code-block"
						role="region"
						aria-label="Cursor MCP config example"
					>
						<code>{`{
  "mcpServers": {
    "epic-scheduler": {
      "url": "https://your-domain${mcpPath}"
    }
  }
}`}</code>
					</pre>
					<p>
						Replace <code>your-domain</code> with the host where Epic Scheduler
						is deployed.
					</p>
				</section>
				<section className="seo-section">
					<h2>Browsing to {mcpPath}</h2>
					<p>
						The MCP endpoint is for clients, not browsers. If you open{' '}
						<code>{mcpPath}</code> in a normal browser tab, you are redirected
						to <a href={sitePaths.aboutMcp}>this page</a> so the connection
						details are easier to find.
					</p>
				</section>
				<footer className="seo-footer-marketing">
					<p className="seo-footer-tagline">
						Build schedules faster with a single link and shared overlap
						visibility.
					</p>
				</footer>
			</main>
		)
	}
}
