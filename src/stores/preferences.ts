import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemePreference='system'|'light'|'dark'
const THEME_KEY='so-tu-hoc:theme'
const SIDEBAR_KEY='so-tu-hoc:sidebar-collapsed'
export const OWL_PREFS_KEY='so-tu-hoc:owl-preferences'

interface OwlPreferences {
  enabled:boolean
  followPointer:boolean
  headTilt:boolean
  autoOpenUrgent:boolean
  quotesEnabled:boolean
}
const owlDefaults:OwlPreferences={enabled:true,followPointer:true,headTilt:true,autoOpenUrgent:true,quotesEnabled:true}

function readTheme():ThemePreference{
  const value=localStorage.getItem(THEME_KEY)
  return value==='light'||value==='dark'?value:'system'
}
function readOwlPreferences():OwlPreferences{
  try{
    const raw=localStorage.getItem(OWL_PREFS_KEY)
    if(!raw)return {...owlDefaults}
    const value=JSON.parse(raw) as Partial<OwlPreferences>
    return{
      enabled:value.enabled!==false,
      followPointer:value.followPointer!==false,
      headTilt:value.headTilt!==false,
      autoOpenUrgent:value.autoOpenUrgent!==false,
      quotesEnabled:value.quotesEnabled!==false,
    }
  }catch{return {...owlDefaults}}
}
function systemDark(){return window.matchMedia?.('(prefers-color-scheme: dark)').matches===true}

export const usePreferencesStore=defineStore('preferences',()=>{
  const theme=ref<ThemePreference>(readTheme())
  const systemPrefersDark=ref(systemDark())
  const sidebarCollapsed=ref(localStorage.getItem(SIDEBAR_KEY)==='1')
  const owl=readOwlPreferences()
  const owlEnabled=ref(owl.enabled)
  const owlFollowPointer=ref(owl.followPointer)
  const owlHeadTilt=ref(owl.headTilt)
  const owlAutoOpenUrgent=ref(owl.autoOpenUrgent)
  const owlQuotesEnabled=ref(owl.quotesEnabled)
  const resolvedTheme=computed<'light'|'dark'>(()=>theme.value==='system'?(systemPrefersDark.value?'dark':'light'):theme.value)

  function applyTheme(){document.documentElement.dataset.theme=resolvedTheme.value}
  function setTheme(value:ThemePreference){theme.value=value;value==='system'?localStorage.removeItem(THEME_KEY):localStorage.setItem(THEME_KEY,value);applyTheme()}
  function toggleTheme(){setTheme(resolvedTheme.value==='dark'?'light':'dark')}
  function toggleSidebar(){sidebarCollapsed.value=!sidebarCollapsed.value;localStorage.setItem(SIDEBAR_KEY,sidebarCollapsed.value?'1':'0')}
  function persistOwl(){localStorage.setItem(OWL_PREFS_KEY,JSON.stringify({enabled:owlEnabled.value,followPointer:owlFollowPointer.value,headTilt:owlHeadTilt.value,autoOpenUrgent:owlAutoOpenUrgent.value,quotesEnabled:owlQuotesEnabled.value}))}

  const media=window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener?.('change',event=>{systemPrefersDark.value=event.matches;if(theme.value==='system')applyTheme()})
  watch(resolvedTheme,applyTheme,{immediate:true})
  watch([owlEnabled,owlFollowPointer,owlHeadTilt,owlAutoOpenUrgent,owlQuotesEnabled],persistOwl)
  return{theme,resolvedTheme,sidebarCollapsed,owlEnabled,owlFollowPointer,owlHeadTilt,owlAutoOpenUrgent,owlQuotesEnabled,setTheme,toggleTheme,toggleSidebar}
})
