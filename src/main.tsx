import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App'
import { Store } from './store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Store>
      <App />
    </Store>
  </StrictMode>,
)
