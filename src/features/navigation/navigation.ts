import type { UserRole } from '../../types/legacy'

export interface NavigationItem{label:string;to:string;icon:string;roles:UserRole[]}
const all:UserRole[]=['student','monitor','teacher','admin']
const learners:UserRole[]=['student','monitor']
const managers:UserRole[]=['teacher','admin']

const item=(label:string,to:string,icon:string,roles:UserRole[]):NavigationItem=>({label,to,icon,roles})

export const navigation:NavigationItem[]=[
  item('Tổng quan','/dashboard','LayoutDashboard',all),
  item('Đăng ký tự học','/register','NotebookPen',learners),
  item('Duyệt đăng ký','/review','ClipboardCheck',managers),
  item('Báo cáo lỗi','/issues','TriangleAlert',all),
  item('Theo dõi lớp','/tracking','UsersRound',['monitor']),
  item('Theo dõi cả lớp','/tracking','UsersRound',managers),
  item('Quản lý tuần','/weeks','CalendarRange',managers),
  item('Thời khóa biểu','/schedule','CalendarClock',managers),
  item('Học sinh','/students','GraduationCap',managers),
  item('Thống kê','/statistics','ChartNoAxesCombined',managers),
  item('Thống kê của tôi','/statistics','ChartNoAxesCombined',learners),
  item('Lịch sử','/history','History',learners),
  item('Nhận xét GV','/comments','MessagesSquare',learners),
  item('Lớp học','/admin?tab=classes','Building2',['admin']),
  item('Giáo viên','/admin?tab=teachers','UserCog',['admin']),
  item('Phân quyền','/admin?tab=permissions','ShieldCheck',['admin']),
  item('Cài đặt','/settings','Settings',managers),
]

const orders:Record<UserRole,string[]>={
  student:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  monitor:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Theo dõi lớp','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  teacher:['Tổng quan','Duyệt đăng ký','Báo cáo lỗi','Theo dõi cả lớp','Quản lý tuần','Thời khóa biểu','Học sinh','Thống kê','Cài đặt'],
  admin:['Tổng quan','Duyệt đăng ký','Báo cáo lỗi','Theo dõi cả lớp','Quản lý tuần','Thời khóa biểu','Học sinh','Thống kê','Lớp học','Giáo viên','Phân quyền','Cài đặt'],
}

export function visibleNavigation(role:UserRole|null|undefined):NavigationItem[]{
  if(!role)return[]
  const allowed=navigation.filter(entry=>entry.roles.includes(role))
  const byLabel=new Map(allowed.map(entry=>[entry.label,entry]))
  return orders[role].map(label=>byLabel.get(label)).filter((entry):entry is NavigationItem=>Boolean(entry))
}
