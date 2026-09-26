import type { RouteRecordRaw } from 'vue-router'
import AppShell from '../../layouts/AppShell.vue'
import DashboardWithPeoplePage from '../../pages/DashboardWithPeoplePage.vue'
import LoginPage from '../../pages/LoginPage.vue'
import type { UserRole } from '../../types/legacy'

// Other pages load on first visit so the initial bundle stays small.
const RegistrationPage = () => import('../../pages/RegistrationPage.vue')
const ApprovalPage = () => import('../../pages/ApprovalPage.vue')
const TrackingPage = () => import('../../pages/TrackingPage.vue')
const StudentsPage = () => import('../../pages/StudentsPage.vue')
const AdminPage = () => import('../../pages/AdminPage.vue')
const SchedulePage = () => import('../../pages/SchedulePage.vue')
const WeeksPage = () => import('../../pages/WeeksPage.vue')
const StatisticsPage = () => import('../../pages/StatisticsPage.vue')
const HistoryPage = () => import('../../pages/HistoryPage.vue')
const CommentsPage = () => import('../../pages/CommentsPage.vue')
const SettingsPage = () => import('../../pages/SettingsPage.vue')
const IssuesPage = () => import('../../pages/IssuesPage.vue')
const HomeworkPage = () => import('../../pages/HomeworkPage.vue')

const learners: UserRole[] = ['student', 'monitor']
const teachers: UserRole[] = ['teacher']
const classUsers: UserRole[] = ['student', 'monitor', 'teacher']

export const routes: RouteRecordRaw[] = [
  { path: '/login', component: LoginPage, meta: { public: true, title: 'Đăng nhập' } },
  {
    path: '/',
    component: AppShell,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: DashboardWithPeoplePage, meta: { title: 'Tổng quan', roles: classUsers } },
      { path: 'register', component: RegistrationPage, meta: { title: 'Đăng ký tự học', roles: learners } },
      { path: 'review', component: ApprovalPage, meta: { title: 'Duyệt đăng ký', roles: teachers } },
      { path: 'homework', component: HomeworkPage, meta: { title: 'Báo bài', roles: ['student','monitor','teacher','admin'] } },
      { path: 'issues', component: IssuesPage, meta: { title: 'Báo cáo lỗi', roles: classUsers } },
      { path: 'tracking', component: TrackingPage, meta: { title: 'Theo dõi cả lớp', roles: ['monitor', ...teachers] } },
      { path: 'weeks', component: WeeksPage, meta: { title: 'Quản lý tuần', roles: teachers } },
      { path: 'schedule', component: SchedulePage, meta: { title: 'Thời khóa biểu', roles: ['monitor', ...teachers] } },
      { path: 'device-policy', redirect: to => ({ path: '/schedule', query: { ...to.query, tab: 'device' } }), meta: { title: 'Thiết bị điện tử', roles: teachers } },
      { path: 'students', component: StudentsPage, meta: { title: 'Học sinh', roles: teachers } },
      { path: 'statistics', component: StatisticsPage, meta: { title: 'Thống kê', roles: classUsers } },
      { path: 'history', component: HistoryPage, meta: { title: 'Lịch sử', roles: learners } },
      { path: 'comments', component: CommentsPage, meta: { title: 'Nhận xét GV', roles: learners } },
      { path: 'admin', component: AdminPage, meta: { title: 'Quản trị', roles: ['admin'] } },
      { path: 'settings', component: SettingsPage, meta: { title: 'Cài đặt', roles: ['student', 'monitor', 'teacher', 'admin'] } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]
