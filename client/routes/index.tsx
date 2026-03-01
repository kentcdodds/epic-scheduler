import { HomeRoute } from './home.tsx'
import { ScheduleRoute } from './schedule.tsx'

export const clientRoutes = {
	'/': <HomeRoute />,
	'/s/:shareToken': <ScheduleRoute />,
}
