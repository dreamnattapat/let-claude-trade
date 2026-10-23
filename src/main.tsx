import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/600.css'
import '@fontsource/mitr/400.css'
import '@fontsource/mitr/500.css'
import './index.css'
import { DayPage } from './components/day/DayPage.tsx'
import { DreamPage } from './components/dream/DreamPage.tsx'

// Follow the device's light or dark setting.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches)
applyTheme()
dark.addEventListener('change', applyTheme)

// /lynch is Team Lynch, the weekly experiment (/dream, its first name, still works); / is the day desk.
const lynch = /^\/(lynch|dream)\/?$/.test(window.location.pathname)
document.title = lynch ? 'ทีม Lynch · เดสก์เทรด' : 'เดย์เทรด · เดสก์เทรด'

createRoot(document.getElementById('root')!).render(<StrictMode>{lynch ? <DreamPage /> : <DayPage />}</StrictMode>)
