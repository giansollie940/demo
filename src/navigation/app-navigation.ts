import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  UserRoundPlus,
  Waypoints,
  BookOpenCheck,
} from 'lucide-vue-next'
import type { AppNavigationItem } from '../types/navigation'

export const appNavigation: readonly AppNavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { key: 'register', label: 'Register', to: '/register', icon: UserRoundPlus },
  { key: 'review', label: 'Review', to: '/review', icon: ClipboardCheck },
  {
    key: 'tracking',
    label: 'Tracking',
    to: '/tracking',
    icon: Waypoints,
    activeRoot: '/tracking',
  },
  { key: 'weeks', label: 'Weeks', to: '/weeks', icon: BookOpenCheck },
  { key: 'schedule', label: 'Schedule', to: '/schedule', icon: CalendarDays },
  { key: 'students', label: 'Students', to: '/students', icon: Users },
  { key: 'statistics', label: 'Statistics', to: '/statistics', icon: ChartNoAxesCombined },
  {
    key: 'admin',
    label: 'Admin',
    to: '/admin/classes',
    icon: ShieldCheck,
    activeRoot: '/admin',
  },
  { key: 'settings', label: 'Settings', to: '/settings', icon: Settings },
]
