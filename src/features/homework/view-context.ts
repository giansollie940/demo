import { defineStore } from 'pinia'
import { ref } from 'vue'

// Shared by the page and Owl; applies the FEAT-002 role permissions.
export function homeworkTabs(role: string) {
  return [
    ...(role === 'admin' ? [{ id: 'overview', label: 'Tổng quan' }] : []),
    ...(role !== 'admin' ? [{ id: 'board', label: 'Bảng Báo bài' }] : [{ id: 'catalog', label: 'Danh mục môn' }]),
    { id: 'history', label: 'Lịch sử đăng' },
    ...(role !== 'admin' ? [{ id: 'corrections', label: 'Yêu cầu chỉnh sửa' }] : []),
    ...(role === 'teacher' ? [{ id: 'reports', label: 'Báo sai thông tin' }] : []),
    { id: 'awards', label: '🌟 Góc tuyên dương' },
    ...(['teacher', 'monitor'].includes(role) ? [{ id: 'queue', label: 'AI trùng' }] : []),
    ...(role === 'teacher' ? [
      { id: 'ai_settings', label: 'Cài đặt AI' },
      { id: 'subjects', label: 'Môn học' },
      { id: 'english', label: 'Tiếng Anh' },
    ] : []),
    ...(['teacher', 'admin'].includes(role) ? [
      { id: 'trash', label: 'Thùng rác' },
      { id: 'audit', label: 'Nhật ký' },
    ] : []),
    ...(role === 'admin' ? [{ id: 'settings', label: 'Cấu hình' }] : []),
  ]
}

export function resolveHomeworkTab(role: string, selectedTab?: string | null) {
  const tabs = homeworkTabs(role)
  return tabs.find(tab => tab.id === selectedTab) ?? tabs[0]
}

export const useHomeworkViewStore = defineStore('homework-view', () => {
  const selectedTab = ref<string | null>(null)
  const refreshVersion = ref(0)
  // undefined outside Báo bài; empty string is an explicit all/no-class scope.
  const scopeClassId = ref<string | undefined>(undefined)
  return { selectedTab, refreshVersion, scopeClassId }
})
