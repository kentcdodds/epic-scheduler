import { post, route } from 'remix/fetch-router/routes'

export const routes = route({
	home: '/',
	chat: '/chat',
	health: '/health',
	scheduleCreate: post('/api/schedules'),
	scheduleRead: '/api/schedules/:shareToken',
	scheduleSubmitAvailability: post('/api/schedules/:shareToken/availability'),
})
