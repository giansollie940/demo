import type { UserRole } from '../../types/legacy'

export interface NavigationItem{label:string;to:string;icon:string;roles:UserRole[]}
const learners:UserRole[]=['student','monitor']
const teachers:UserRole[]=['teacher']

const item=(label:string,to:string,icon:string,roles:UserRole[]):NavigationItem=>({label,to,icon,roles})

export const navigation:NavigationItem[]=[
  item('Tổng quan','/dashboard','LayoutDashboard',['student','monitor','teacher']),
  item('Đăng ký tự học','/register','NotebookPen',learners),
  item('Duyệt đăng ký','/review','ClipboardCheck',teachers),
  item('Báo cáo lỗi','/issues','TriangleAlert',['student','monitor','teacher']),
  item('Theo dõi lớp','/tracking','UsersRound',['monitor']),
  item('Theo dõi cả lớp','/tracking','UsersRound',teachers),
  item('Quản lý tuần','/weeks','CalendarRange',teachers),
  item('Thời khóa biểu','/schedule','CalendarClock',teachers),
  item('Học sinh','/students','GraduationCap',teachers),
  item('Thống kê','/statistics','ChartNoAxesCombined',teachers),
  item('Thống kê của tôi','/statistics','ChartNoAxesCombined',learners),
  item('Lịch sử','/history','History',learners),
  item('Nhận xét GV','/comments','MessagesSquare',learners),
  item('Quản trị hệ thống','/admin','ShieldCheck',['admin']),
  item('Cài đặt','/settings','Settings',teachers),
]

const orders:Record<UserRole,string[]>={
  student:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  monitor:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Theo dõi lớp','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  teacher:['Tổng quan','Duyệt đăng ký','Báo cáo lỗi','Theo dõi cả lớp','Quản lý tuần','Thời khóa biểu','Học sinh','Thống kê','Cài đặt'],
  admin:['Quản trị hệ thống'],
}

export function visibleNavigation(role:UserRole|null|undefined):NavigationItem[]{
  if(!role)return[]
  const allowed=navigation.filter(entry=>entry.roles.includes(role))
  const byLabel=new Map(allowed.map(entry=>[entry.label,entry]))
  return orders[role].map(label=>byLabel.get(label)).filter((entry):entry is NavigationItem=>Boolean(entry))
}
