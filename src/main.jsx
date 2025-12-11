import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import BakuganSaveEditor from './SaveEditor.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BakuganSaveEditor />
  </StrictMode>,
)
