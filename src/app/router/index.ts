import { createRouter, createWebHashHistory } from 'vue-router'
import FoundationDashboardPage from '../../pages/FoundationDashboardPage.vue'
import FoundationPlaceholderPage from '../../pages/FoundationPlaceholderPage.vue'

const placeholder = FoundationPlaceholderPage

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: FoundationDashboardPage, meta: { title: 'Dashboard' } },
    { path: '/register', component: placeholder, meta: { title: 'Register' } },
    { path: '/review', component: placeholder, meta: { title: 'Review' } },
    { path: '/tracking', component: placeholder, meta: { title: 'Tracking' } },
    { path: '/tracking/:sessionId', component: placeholder, meta: { title: 'Tracking' } },
    { path: '/weeks', component: placeholder, meta: { title: 'Weeks' } },
    { path: '/schedule', component: placeholder, meta: { title: 'Schedule' } },
    { path: '/students', component: placeholder, meta: { title: 'Students' } },
    { path: '/statistics', component: placeholder, meta: { title: 'Statistics' } },
    { path: '/history', component: placeholder, meta: { title: 'History' } },
    { path: '/comments', component: placeholder, meta: { title: 'Comments' } },
    { path: '/admin/classes', component: placeholder, meta: { title: 'Classes' } },
    { path: '/admin/teachers', component: placeholder, meta: { title: 'Teachers' } },
    { path: '/admin/permissions', component: placeholder, meta: { title: 'Permissions' } },
    { path: '/settings', component: placeholder, meta: { title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
