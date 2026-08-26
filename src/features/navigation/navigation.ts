import type { UserRole } from '../../types/legacy'

export interface NavigationItem{label:string;to:string;icon:string;roles:UserRole[]}
const all:UserRole[]=['student','monitor','teacher','admin']
const learners:UserRole[]=['student','monitor']
const managers:UserRole[]=['teacher','admin']

export const navigation:NavigationItem[]=[
  {label:'Tổng quan',to:'/dashboard',icon:'LayoutDashboard',roles:all},
  {label:'Đăng ký tự học',to:'/register',icon:'NotebookPen',roles:learners},
  {label:'Duyệt đăng ký',to:'/review',icon:'ClipboardCheck',roles:managers},
  {label:'Báo cáo lỗi',to:'/issues',icon:'TriangleAlert',roles:all},
  {label:'Theo dõi cả lớp',to:'/tracking',icon:'UsersRound',roles:['monitor',...managers]},
  {label:'Quản lý tuần',to:'/weeks',icon:'CalendarRange',roles:managers},
  {label:'Thời khóa biểu',to:'/schedule',icon:'CalendarClock',roles:managers},
  {label:'Học sinh',to:'/students',icon:'GraduationCap',roles:managers},
  {label:'Thống kê',to:'/statistics',icon:'ChartNoAxesCombined',roles:managers},
  {label:'Lịch sử',to:'/history',icon:'History',roles:learners},
  {label:'Nhận xét GV',to:'/comments',icon:'MessagesSquare',roles:learners},
  {label:'Quản trị',to:'/admin',icon:'ShieldCheck',roles:['admin']},
  {label:'Cài đặt',to:'/settings',icon:'Settings',roles:all},
]
export function visibleNavigation(role:UserRole|null|undefined){return role?navigation.filter(item=>item.roles.includes(role)):[]}
