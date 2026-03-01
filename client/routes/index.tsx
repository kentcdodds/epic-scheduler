import { ChatRoute } from './chat.tsx'
import { HomeRoute } from './home.tsx'
import { ScheduleRoute } from './schedule.tsx'

export const clientRoutes = {
	'/': <HomeRoute />,
	'/chat': <ChatRoute />,
	'/s/:shareToken': <ScheduleRoute />,
}
