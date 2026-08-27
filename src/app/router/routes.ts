import type { RouteRecordRaw } from 'vue-router'
import AppShell from '../../layouts/AppShell.vue'
import DashboardPage from '../../pages/DashboardPage.vue'
import LoginPage from '../../pages/LoginPage.vue'
import RegistrationPage from '../../pages/RegistrationPage.vue'
import ApprovalPage from '../../pages/ApprovalPage.vue'
import TrackingPage from '../../pages/TrackingPage.vue'
import StudentsPage from '../../pages/StudentsPage.vue'
import AdminPage from '../../pages/AdminPage.vue'
import SchedulePage from '../../pages/SchedulePage.vue'
import WeeksPage from '../../pages/WeeksPage.vue'
import StatisticsPage from '../../pages/StatisticsPage.vue'
import HistoryPage from '../../pages/HistoryPage.vue'
import CommentsPage from '../../pages/CommentsPage.vue'
import SettingsPage from '../../pages/SettingsPage.vue'
import IssuesPage from '../../pages/IssuesPage.vue'
import type { UserRole } from '../../types/legacy'

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
      { path: 'dashboard', component: DashboardPage, meta: { title: 'Tổng quan', roles: classUsers } },
      { path: 'register', component: RegistrationPage, meta: { title: 'Đăng ký tự học', roles: learners } },
      { path: 'review', component: ApprovalPage, meta: { title: 'Duyệt đăng ký', roles: teachers } },
      { path: 'issues', component: IssuesPage, meta: { title: 'Báo cáo lỗi', roles: classUsers } },
      { path: 'tracking', component: TrackingPage, meta: { title: 'Theo dõi cả lớp', roles: ['monitor', ...teachers] } },
      { path: 'weeks', component: WeeksPage, meta: { title: 'Quản lý tuần', roles: teachers } },
      { path: 'schedule', component: SchedulePage, meta: { title: 'Thời khóa biểu', roles: teachers } },
      { path: 'students', component: StudentsPage, meta: { title: 'Học sinh', roles: teachers } },
      { path: 'statistics', component: StatisticsPage, meta: { title: 'Thống kê', roles: classUsers } },
      { path: 'history', component: HistoryPage, meta: { title: 'Lịch sử', roles: learners } },
      { path: 'comments', component: CommentsPage, meta: { title: 'Nhận xét GV', roles: learners } },
      { path: 'admin', component: AdminPage, meta: { title: 'Quản trị', roles: ['admin'] } },
      { path: 'settings', component: SettingsPage, meta: { title: 'Cài đặt', roles: classUsers } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]
