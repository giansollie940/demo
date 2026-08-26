import type { UserRole } from '../../types/legacy'

export interface NavigationItem{label:string;to:string;icon:string;roles:UserRole[]}
export interface NavigationGroup{label:string;items:NavigationItem[]}
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

const pick=(role:UserRole,labels:string[])=>navigation.filter(entry=>entry.roles.includes(role)&&labels.includes(entry.label))

export function visibleNavigationGroups(role:UserRole|null|undefined):NavigationGroup[]{
  if(!role)return[]
  if(role==='student')return[
    {label:'HỌC TẬP',items:pick(role,['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Lịch sử','Nhận xét GV'])},
    {label:'CÁ NHÂN',items:pick(role,['Thống kê của tôi'])},
  ]
  if(role==='monitor')return[
    {label:'HỌC TẬP',items:pick(role,['Tổng quan','Đăng ký tự học','Báo cáo lỗi','Lịch sử','Nhận xét GV'])},
    {label:'HỖ TRỢ LỚP',items:pick(role,['Theo dõi lớp'])},
    {label:'CÁ NHÂN',items:pick(role,['Thống kê của tôi'])},
  ]
  const groups:NavigationGroup[]=[
    {label:'HỌC TẬP',items:pick(role,['Tổng quan','Duyệt đăng ký','Báo cáo lỗi','Theo dõi cả lớp'])},
    {label:'QUẢN LÝ',items:pick(role,['Quản lý tuần','Thời khóa biểu','Học sinh'])},
    {label:'PHÂN TÍCH',items:pick(role,['Thống kê'])},
  ]
  if(role==='admin')groups.push({label:'QUẢN TRỊ',items:pick(role,['Lớp học','Giáo viên','Phân quyền'])})
  groups.push({label:'HỆ THỐNG',items:pick(role,['Cài đặt'])})
  return groups.filter(group=>group.items.length)
}

export function visibleNavigation(role:UserRole|null|undefined){return visibleNavigationGroups(role).flatMap(group=>group.items)}
