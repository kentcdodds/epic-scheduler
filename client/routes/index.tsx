import { HomeRoute } from './home.tsx'
import { ScheduleRoute } from './schedule.tsx'
import { ScheduleHostRoute } from './schedule-host.tsx'

export const clientRoutes = {
	'/': <HomeRoute />,
	'/s/:shareToken': <ScheduleRoute />,
	'/s/:shareToken/host': <ScheduleHostRoute />,
}
