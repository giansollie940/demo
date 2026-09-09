import { defineStore } from 'pinia'
import { ref } from 'vue'

// Shared by the page and Owl; preserves the existing FEAT-001 tab permissions.
export function homeworkTabs(role: string) {
  return [
    ...(role === 'admin' ? [{ id: 'overview', label: 'Tổng quan' }] : []),
    { id: 'board', label: 'Bảng Báo bài' },
    { id: 'history', label: 'Lịch sử đăng' },
    { id: 'awards', label: '🌟 Góc tuyên dương' },
    ...(['teacher', 'monitor', 'admin'].includes(role) ? [{ id: 'queue', label: 'AI trùng' }] : []),
    ...(['teacher', 'admin'].includes(role) ? [
      { id: 'subjects', label: 'Môn học' },
      { id: 'english', label: 'Tiếng Anh' },
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
  return { selectedTab }
})
