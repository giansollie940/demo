import '../../src/styles/tokens.css';import '../../src/styles/themes.css';import '../../src/styles/base.css';
import {createApp,h} from 'vue';import {createPinia} from 'pinia';
import {useAuthStore} from '../../src/stores/auth';import {useContextStore} from '../../src/stores/context';
import HomeworkPage from '../../src/pages/HomeworkPage.vue';
const role=new URLSearchParams(location.search).get('role')||'student';
const actor='00000000-0000-0000-0000-00000000000'+({student:3,monitor:4,teacher:5,admin:6}[role]);
const classId='4e0b25e4-ec47-4745-8b2b-ba91c1504254';
async function call(action,data,review=false){return fetch('/__feat005_fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,action,data,review})}).then(r=>r.json());}
window.SupabaseService={init:async()=>({rpc:async(_,p)=>call(p.p_action,p.p_data),functions:{invoke:async(_,p)=>{const result=await call(p.body.action||'submit',p.body,true);return result.error?result:{data:{ok:true,notice:result.data},error:null};}}})};
const app=createApp({render:()=>h('main',{style:'max-width:1180px;margin:auto;padding:20px'},[h('p','LOCAL FIXTURE — '+role),h(HomeworkPage)])});app.use(createPinia());
useAuthStore().currentUser={id:actor,role,classId,name:role,fullName:role};useContextStore().selectedClassId=classId;app.mount('#app');
