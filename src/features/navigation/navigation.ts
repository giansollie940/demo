import type { UserRole } from '../../types/legacy'

export interface NavigationItem{label:string;to:string;icon:string;roles:UserRole[]}
const learners:UserRole[]=['student','monitor']
const teachers:UserRole[]=['teacher']
const admins:UserRole[]=['admin']
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
  item('Tổng quan','/admin','LayoutDashboard',admins),
  item('Năm học','/admin?tab=years','CalendarRange',admins),
  item('Lớp học','/admin?tab=classes','Building2',admins),
  item('Học sinh','/admin?tab=students','GraduationCap',admins),
  item('Giáo viên','/admin?tab=teachers','UsersRound',admins),
  item('Phân quyền','/admin?tab=permissions','ShieldCheck',admins),
  item('Nhật ký hệ thống','/admin?tab=audit','History',admins),
  item('Tùy chọn cá nhân','/settings?view=personal','Settings',admins),
  item('Cài đặt','/settings','Settings',teachers),
]

const orders:Record<UserRole,string[]>={
  student:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  monitor:['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Theo dõi lớp','Lịch sử','Nhận xét GV','Thống kê của tôi'],
  teacher:['Tổng quan','Duyệt đăng ký','Báo cáo lỗi','Theo dõi cả lớp','Quản lý tuần','Thời khóa biểu','Học sinh','Thống kê','Cài đặt'],
  admin:['Tổng quan','Năm học','Lớp học','Học sinh','Giáo viên','Phân quyền','Nhật ký hệ thống','Tùy chọn cá nhân'],
}

export function visibleNavigation(role:UserRole|null|undefined):NavigationItem[]{
  if(!role)return[]
  const allowed=navigation.filter(entry=>entry.roles.includes(role))
  const queues=new Map<string,NavigationItem[]>()
  for(const entry of allowed){const list=queues.get(entry.label)??[];list.push(entry);queues.set(entry.label,list)}
  return orders[role].map(label=>queues.get(label)?.shift()).filter((entry):entry is NavigationItem=>Boolean(entry))
}
