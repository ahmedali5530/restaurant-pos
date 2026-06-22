import React from 'react'
import ReactDOM from 'react-dom/client'
import { i18nReady } from '@/lib/i18n.ts'

await i18nReady

const { default: App } = await import('./app.tsx')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
