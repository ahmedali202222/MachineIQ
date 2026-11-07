import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Static browser demo: simulate the backend in the page (see src/demo/mockApi.js).
if (import.meta.env.VITE_DEMO) {
  const { installMockApi } = await import('./demo/mockApi.js')
  installMockApi()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
