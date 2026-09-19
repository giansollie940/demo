<script setup lang="ts">
import { computed } from 'vue'
import DashboardPage from './DashboardPage.vue'
import ClassPeoplePanel from '../components/profile/ClassPeoplePanel.vue'
import { useAuthStore } from '../stores/auth'

const auth=useAuthStore()
const isLearner=computed(()=>auth.currentUser?.role==='student'||auth.currentUser?.role==='monitor')
</script>

<template>
  <div class="dashboard-with-people">
    <DashboardPage/>
    <div v-if="isLearner" class="people-wrap">
      <ClassPeoplePanel/>
    </div>
  </div>
</template>

<style scoped>
.dashboard-with-people{display:grid;gap:16px}.people-wrap{width:min(1296px,100%);margin:0 auto}
</style>
