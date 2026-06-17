import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/lib/i18n.ts'
import App from './app.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
