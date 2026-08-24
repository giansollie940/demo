import { build, preview } from 'vite'

export default async function startPreviewServer() {
  await build()

  const previewServer = await preview({
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  })

  return async () => {
    await previewServer.close()
  }
}
