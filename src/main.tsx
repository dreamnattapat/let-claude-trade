import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/mitr/400.css'
import '@fontsource/mitr/500.css'
import './index.css'
import { DreamPage } from './components/dream/DreamPage.tsx'

// Follow the device's light or dark setting.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

// One experiment now: Team Lynch ("Swing Cook"), at / and at its old addresses /lynch and /dream.
// (A day-trading desk ran here from 23 to 24 Oct 2026; its backtests found no edge after costs, so it was removed.)
document.title = 'Swing Cook · Let Claude Cook'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DreamPage />
  </StrictMode>,
)
