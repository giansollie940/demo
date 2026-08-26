import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { pinia } from './app/pinia'
import { router } from './app/router'
import { queryClient } from './app/query-client'
import { useAuthStore } from './stores/auth'
import { useContextStore } from './stores/context'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'

async function bootstrap(){
  const auth=useAuthStore(pinia);const context=useContextStore(pinia)
  await auth.bootstrap();context.hydrate(auth.legacyState)
  const app=createApp(App);app.use(pinia);app.use(VueQueryPlugin,{queryClient});app.use(router);await router.isReady();app.mount('#app')
}
void bootstrap()
