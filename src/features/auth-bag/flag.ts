/**
 * AUTH-BAG-001 rollout switch. Off unless the deployed config.js sets `authBag: true`
 * (repository variable AUTH_BAG_ENABLED=true in the Pages workflow), so the school-bag option
 * stays hidden until the database upgrade and both Edge Functions are live.
 */
export function bagLoginEnabled(): boolean {
  return window.APP_CONFIG?.authBag === true
}
