import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const { version, buildNumber, versionStartBuild } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const [major, minor] = version.split('.')
const releaseVersion = `${major}.${minor}.${buildNumber - versionStartBuild}`

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  define: { __APP_VERSION_LABEL__: JSON.stringify(`v${releaseVersion} (Build ${buildNumber})`) },
})
