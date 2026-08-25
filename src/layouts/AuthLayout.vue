<template><main class="auth-layout"><slot /></main></template>
<style scoped>
.auth-layout{min-height:100vh;padding:24px;display:grid;place-items:center;background:radial-gradient(circle at 10% 10%,color-mix(in srgb,var(--color-primary) 12%,transparent),transparent 32%),var(--bg)}
@media(max-width:720px){.auth-layout{padding:12px}}
</style>
