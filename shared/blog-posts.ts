export type BlogPost = {
	slug: string
	title: string
	description: string
	publishedDate: string
	readingMinutes: number
	lede: string
	bodyHtml: string
}

export const blogPosts: Array<BlogPost> = [
	{
		slug: 'chatgpt-claude-mcp-availability-links',
		title: 'Use ChatGPT and Claude to answer availability links with MCP',
		description:
			'How to connect Epic Scheduler to ChatGPT and Claude through MCP so AI agents can submit availability from one shared link.',
		publishedDate: '2026-03-02',
		readingMinutes: 8,
		lede: 'Paste one scheduling link plus constraints, and an AI agent can submit your availability and summarize overlap windows.',
		bodyHtml: `<p>
				If someone sends you a scheduling link, you should be able to reply with
				your constraints once and let an agent do the rest. Epic Scheduler's MCP
				server makes that possible in both ChatGPT and Claude.
			</p>
			<p>
				This post covers the full setup and the practical workflow of asking an
				AI agent to respond to a specific availability link on your behalf.
			</p>
			<div class="seo-inline-demo">
				<img
					src="/blog/chatgpt-claude-mcp/epic-scheduler-home-page.png"
					alt="Epic Scheduler home page showing a paintable availability grid"
					loading="lazy"
					style="width: 100%; height: auto; border-radius: 0.5rem"
				/>
				<p class="seo-meta">
					Epic Scheduler host setup: one grid, one link, timezone-aware slots.
				</p>
			</div>
			<h2>Why this workflow matters</h2>
			<p>
				Most scheduling friction comes from context switching and repeated
				translation: "What timezone?", "Does Tuesday morning still work?", "Did
				you fill out the poll yet?" MCP removes that repetition by letting
				agents call scheduling tools directly.
			</p>
			<ul>
				<li>Share one scheduling URL.</li>
				<li>Describe your constraints in natural language.</li>
				<li>Let the agent submit and verify your availability.</li>
			</ul>
			<div class="seo-inline-demo">
				<img
					src="/blog/chatgpt-claude-mcp/epic-scheduler-share-link-page.png"
					alt="Epic Scheduler share link page with selected overlap slots"
					loading="lazy"
					style="width: 100%; height: auto; border-radius: 0.5rem"
				/>
				<p class="seo-meta">
					Each shared schedule is link-based, identified by
					<code>/s/:shareToken</code>.
				</p>
			</div>
			<h2>What Epic Scheduler exposes via MCP</h2>
			<p>
				Epic Scheduler serves MCP at <code>/mcp</code> and exposes tools for the
				core scheduling loop:
			</p>
			<ul>
				<li><code>create_schedule</code></li>
				<li><code>submit_schedule_availability</code></li>
				<li><code>get_schedule_snapshot</code></li>
				<li><code>open_schedule_ui</code> (MCP app widget)</li>
				<li><code>open_schedule_host_ui</code> (host MCP app widget)</li>
			</ul>
			<p>
				In other words: create a link, submit attendee slots, inspect overlap,
				repeat.
			</p>
			<h2>Validate tools in MCP Jam Inspector</h2>
			<p>
				Before connecting in ChatGPT or Claude, run a quick MCP Jam Inspector
				pass so you can confirm your server wiring and tool contracts.
			</p>
			<ol>
				<li>
					Start inspector and connect to
					<code>https://epic-scheduler.com/mcp</code>.
				</li>
				<li>Confirm all scheduler tools are listed.</li>
				<li>Run <code>create_schedule</code> once and copy the share token.</li>
				<li>Use the same token in attendee and host app checks.</li>
			</ol>
			<div class="seo-inline-demo">
				<img
					src="/blog/chatgpt-claude-mcp/openai-connect-from-chatgpt-docs.png"
					alt="MCP Jam Inspector showing Epic Scheduler tools from a connected MCP server"
					loading="lazy"
					style="width: 100%; height: auto; border-radius: 0.5rem"
				/>
				<p class="seo-meta">
					MCP Jam Inspector with Epic Scheduler tools connected and ready.
				</p>
			</div>
			<h2>Validate host app routing and input propagation</h2>
			<p>
				Use <code>open_schedule_host_ui</code> with a share token and host
				access token, then verify the host app receives both values and loads
				the embedded dashboard route.
			</p>
			<ol>
				<li>
					Call <code>open_schedule_host_ui</code> with
					<code>shareToken</code> and <code>hostAccessToken</code>.
				</li>
				<li>
					Confirm the host widget shows the same token and host access token.
				</li>
				<li>
					Confirm the iframe loads
					<code>/s/{shareToken}/{hostAccessToken}</code>.
				</li>
				<li>Toggle a blocked slot to validate host-side controls.</li>
			</ol>
			<div class="seo-inline-demo">
				<img
					src="/blog/chatgpt-claude-mcp/claude-remote-mcp-docs.png"
					alt="Epic Scheduler host MCP app with share token propagation and loaded host dashboard"
					loading="lazy"
					style="width: 100%; height: auto; border-radius: 0.5rem"
				/>
				<p class="seo-meta">
					Host MCP app loaded from <code>open_schedule_host_ui</code>.
				</p>
			</div>
			<h2>The one-link prompt pattern</h2>
			<p>
				Once connected, you can give the model one link and one sentence of
				availability constraints:
			</p>
			<p>
				<em
					>Use Epic Scheduler to respond to this scheduling link as "Jordan
					Lee": https://epic-scheduler.com/s/abc123. I am available Tue/Thu
					9:00–11:30 AM PT and Wed 1:00–3:00 PM PT. Submit my availability and
					summarize best overlap windows.</em
				>
			</p>
			<p>The agent should:</p>
			<ol>
				<li>Parse the share token from the URL.</li>
				<li>Load the schedule snapshot.</li>
				<li>Translate constraints into valid slot timestamps.</li>
				<li>Submit via <code>submit_schedule_availability</code>.</li>
				<li>Re-read overlap and report recommended windows.</li>
			</ol>
			<h2>Optional UI workflow via MCP Apps</h2>
			<p>
				If the host supports MCP Apps, <code>open_schedule_ui</code> can render
				a widget for creating links, submitting availability, and loading
				snapshots.
			</p>
			<div class="seo-inline-demo">
				<img
					src="/blog/chatgpt-claude-mcp/epic-scheduler-mcp-widget-page.png"
					alt="Epic Scheduler attendee MCP app widget with share token and attendee name prefilled"
					loading="lazy"
					style="width: 100%; height: auto; border-radius: 0.5rem"
				/>
				<p class="seo-meta">
					Attendee MCP app opened from <code>open_schedule_ui</code> with tool
					inputs already applied.
				</p>
			</div>
			<h2>Why teams love this workflow</h2>
			<ul>
				<li>
					<strong>Less back-and-forth:</strong> one shared link replaces long
					scheduling threads.
				</li>
				<li>
					<strong>Faster decisions:</strong> overlap summaries make the best
					windows obvious.
				</li>
				<li>
					<strong>Agent-ready:</strong> ChatGPT and Claude can act on the same
					MCP server and process.
				</li>
			</ul>
			<p>
				If your team coordinates meetings across timezones, Epic Scheduler gives
				you a practical speed boost: create once, share once, and let AI handle
				the repetitive scheduling mechanics.
			</p>`,
	},
	{
		slug: 'meeting-scheduler-for-remote-teams',
		title: 'A practical meeting scheduler for remote teams',
		description:
			'How to reduce scheduling back-and-forth with one link, shared overlap heatmaps, and clearer host decisions.',
		publishedDate: '2026-03-01',
		readingMinutes: 6,
		lede: 'Remote teams lose momentum in scheduling threads. A link-first workflow keeps discussion in one place and decisions faster.',
		bodyHtml: `<p>
				Remote teams rarely struggle with ideas. They struggle with coordination
				latency. A single planning meeting can trigger three timezone
				conversions, half a dozen “I can do later” replies, and one person who
				never sees the final thread.
			</p>
			<p>
				Epic Scheduler removes the thread overhead: the host paints availability
				once, shares one link, and attendees paint their windows with names.
			</p>
			<h2>What changes when scheduling is visual</h2>
			<ul>
				<li>
					<strong>Signal improves:</strong> overlap intensity tells you where
					consensus exists.
				</li>
				<li>
					<strong>Risk drops:</strong> attendee names are visible per slot, so
					you avoid accidental exclusions.
				</li>
				<li>
					<strong>Decision time shrinks:</strong> hosts can book directly from
					the heatmap without another poll round.
				</li>
			</ul>
			<h2>Process that works in small teams</h2>
			<ol>
				<li>Host sets interval and date range.</li>
				<li>Host paints realistic availability (not theoretical “all day”).</li>
				<li>Share one link in team chat.</li>
				<li>Attendees add names and paint windows.</li>
				<li>Host chooses a slot with best overlap and books externally.</li>
			</ol>
			<p>
				For 4–8 person groups, this is usually enough to avoid calendar
				integration complexity while still improving booking quality.
			</p>`,
	},
	{
		slug: 'timezone-overlap-without-calendar-chaos',
		title: 'Find timezone overlap without calendar chaos',
		description:
			'Simple habits for cross-timezone scheduling: UTC slot identity, paintable windows, and role clarity for hosts.',
		publishedDate: '2026-03-01',
		readingMinutes: 7,
		lede: 'Timezone confusion is usually a process problem, not a tooling problem. Use a few constraints and overlap gets easier.',
		bodyHtml: `<p>
				When people say “timezone scheduling is hard,” they usually mean “our
				process depends on text interpretation.” A better system uses explicit
				slots and shared visibility.
			</p>
			<h2>Rule 1: Keep slot identity in UTC</h2>
			<p>
				Epic Scheduler stores slot keys in UTC and translates for display. This
				prevents daylight-saving drift and avoids duplicated ambiguous times.
			</p>
			<h2>Rule 2: Paint windows, not vague preferences</h2>
			<p>
				“Morning works” is hard to action globally. Painted slots force concrete
				bounds and produce higher quality overlap.
			</p>
			<h2>Rule 3: Separate participation from decision ownership</h2>
			<p>
				Attendees contribute availability. Hosts choose final time. This avoids
				deadlocks where everyone waits for someone else to decide.
			</p>
			<h2>Rule 4: Use visual intensity for triage</h2>
			<p>
				Deep color means broader attendance. Start there, then inspect names for
				must-have participants before booking.
			</p>
			<p>
				You do not need a heavy meeting stack to make this work. A link, a grid,
				and clear ownership is enough for most async teams.
			</p>`,
	},
]

export function getBlogPostBySlug(slug: string) {
	return blogPosts.find((post) => post.slug === slug) ?? null
}

export function getBlogPosts() {
	return blogPosts.slice()
}
