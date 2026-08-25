import { createApp } from 'vue'
import Cp2Preview from './Cp2Preview.vue'
import '../../src/styles/tokens.css'
import '../../src/styles/themes.css'
import '../../src/styles/base.css'

document.documentElement.dataset.theme = 'light'
createApp(Cp2Preview).mount('#preview')
