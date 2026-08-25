<template><main class="auth-layout"><slot /></main></template>
<style scoped>
.auth-layout{min-height:100vh;padding:24px;display:grid;place-items:center;background:radial-gradient(circle at 8% 8%,var(--wash-pink),transparent 28%),radial-gradient(circle at 92% 12%,var(--wash-sky),transparent 30%),radial-gradient(circle at 82% 92%,var(--wash-mint),transparent 27%),radial-gradient(circle at 12% 88%,var(--wash-sun),transparent 24%),var(--bg)}
@media(max-width:720px){.auth-layout{padding:12px}}
</style>
