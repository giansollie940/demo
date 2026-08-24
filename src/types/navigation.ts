import type { Component } from 'vue'

export interface AppNavigationItem {
  key: string
  label: string
  to: string
  icon: Component
  activeRoot?: string
}
