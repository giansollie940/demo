import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemePreference='system'|'light'|'dark'
const THEME_KEY='so-tu-hoc:theme'
const SIDEBAR_KEY='so-tu-hoc:sidebar-collapsed'

function readTheme():ThemePreference{
  const value=localStorage.getItem(THEME_KEY)
  return value==='light'||value==='dark'?value:'system'
}
function systemDark(){return window.matchMedia?.('(prefers-color-scheme: dark)').matches===true}

export const usePreferencesStore=defineStore('preferences',()=>{
  const theme=ref<ThemePreference>(readTheme())
  const systemPrefersDark=ref(systemDark())
  const sidebarCollapsed=ref(localStorage.getItem(SIDEBAR_KEY)==='1')
  const resolvedTheme=computed<'light'|'dark'>(()=>theme.value==='system'?(systemPrefersDark.value?'dark':'light'):theme.value)

  function applyTheme(){document.documentElement.dataset.theme=resolvedTheme.value}
  function setTheme(value:ThemePreference){theme.value=value;value==='system'?localStorage.removeItem(THEME_KEY):localStorage.setItem(THEME_KEY,value);applyTheme()}
  function toggleTheme(){setTheme(resolvedTheme.value==='dark'?'light':'dark')}
  function toggleSidebar(){sidebarCollapsed.value=!sidebarCollapsed.value;localStorage.setItem(SIDEBAR_KEY,sidebarCollapsed.value?'1':'0')}
  const media=window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener?.('change',event=>{systemPrefersDark.value=event.matches;if(theme.value==='system')applyTheme()})
  watch(resolvedTheme,applyTheme,{immediate:true})
  return{theme,resolvedTheme,sidebarCollapsed,setTheme,toggleTheme,toggleSidebar}
})
