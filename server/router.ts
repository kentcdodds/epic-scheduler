import { createRouter } from 'remix/fetch-router'
import { type AppEnv } from '#types/env-schema.ts'
import { chat } from './handlers/chat.ts'
import { createHealthHandler } from './handlers/health.ts'
import { home } from './handlers/home.ts'
import { createScheduleCreateHandler } from './handlers/schedule-create.ts'
import { createScheduleReadHandler } from './handlers/schedule-read.ts'
import { createScheduleSubmitAvailabilityHandler } from './handlers/schedule-submit-availability.ts'
import { Layout } from './layout.ts'
import { render } from './render.ts'
import { routes } from './routes.ts'

export function createAppRouter(appEnv: AppEnv) {
	const router = createRouter({
		middleware: [],
		async defaultHandler() {
			return render(Layout({}))
		},
	})

	router.map(routes.home, home)
	router.map(routes.chat, chat)
	router.map(routes.health, createHealthHandler(appEnv))
	router.map(routes.scheduleCreate, createScheduleCreateHandler(appEnv))
	router.map(routes.scheduleRead, createScheduleReadHandler(appEnv))
	router.map(
		routes.scheduleSubmitAvailability,
		createScheduleSubmitAvailabilityHandler(appEnv),
	)

	return router
}
