import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ConsoleApp } from './console/ConsoleApp.tsx'
import { LandingApp } from './landing/LandingApp.tsx'

// path 別に SPA を切り替える。
//   /          → 公開 LP (LandingApp)
//   /console   → 管理コンソール (ConsoleApp, BasicAuth)
//   /config    → 旧 admin UI (App, BasicAuth)
// （かつての /mock 配下のテーマモックは archive/mock-themes-2026-05-04.zip に退避済み）
const path = window.location.pathname
const isConsole = path.startsWith('/console')
const isConfig = path.startsWith('/config')
const isLanding = !isConsole && !isConfig

const basename = isConsole
  ? '/console'
  : isConfig
    ? '/config'
    : '/'

function pickRoot() {
  if (isConsole) return <ConsoleApp />
  if (isLanding) return <LandingApp />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      {pickRoot()}
    </BrowserRouter>
  </StrictMode>,
)
