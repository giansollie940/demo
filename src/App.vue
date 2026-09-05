<script setup lang="ts">
import AppDialogHost from './components/ui/AppDialogHost.vue'
import { useRealtimeInvalidation } from './realtime/useRealtimeInvalidation'

useRealtimeInvalidation()
</script>
<template><RouterView /><AppDialogHost /></template>
