import { legacyApi } from '../../services/legacy-supabase'
type Change = { new: { affects_r2?: boolean } }
interface Channel {
  on(event: string, filter: Record<string, string>, callback: (payload: Change) => void): Channel
  subscribe(callback: (status: string) => void): Channel
}
interface Client {
  channel(name: string): Channel
  removeChannel(channel: Channel): Promise<unknown>
  from(table: string): { select(columns: string): { limit(n: number): Promise<{error: unknown}> } }
}
/** A dedicated Admin-only signal channel; never subscribe to private attachment payloads. */
export async function subscribeStorageChanges(onChange: (r2: boolean) => void, onStatus: (status: string) => void): Promise<() => void> {
  const client = await legacyApi.init() as unknown as Client
  const check = await client.from('storage_change_signals').select('source_table').limit(1)
  if (check.error) throw new Error('Chưa bật tín hiệu dung lượng. Cần cài SQL 17; vẫn có thể đo bằng nút bên dưới.')
  let stopped = false
  const changed = (payload: Change) => { if (!stopped) onChange(!!payload.new.affects_r2) }
  const channel = client.channel('storage-health-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', {event:'INSERT',schema:'public',table:'storage_change_signals'}, changed)
    .on('postgres_changes', {event:'UPDATE',schema:'public',table:'storage_change_signals'}, changed)
    .subscribe(status => { if (!stopped) onStatus(status) })
  return () => { stopped = true; void client.removeChannel(channel).catch(() => {}) }
}
