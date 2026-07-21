import { i18nReady } from '@/lib/i18n.ts'

await i18nReady

const { default: App } = await import('./app.tsx')
import ReactDOM from 'react-dom/client'

// StrictMode double-mounts effects and can tear down the Surreal WS while React
// state still reports connected (especially with the auth gateway relay).
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
