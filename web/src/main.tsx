import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { ConsoleApp } from './console/ConsoleApp.tsx'
import { DocsApp } from './docs/DocsApp.tsx'
import { LandingApp } from './landing/LandingApp.tsx'

// path 別に SPA を切り替える。
//   /          → 公開 LP (LandingApp)
//   /docs      → 公開 Docs (DocsApp)
//   /console   → 管理コンソール (ConsoleApp, BasicAuth)
// （かつての /config は Phase 2.7 で 301 → /console に永続リダイレクト済み）
// （かつての /mock 配下のテーマモックは archive/mock-themes-2026-05-04.zip に退避済み）
const path = window.location.pathname
const isConsole = path.startsWith('/console')
const isDocs = path.startsWith('/docs')
const isLanding = !isConsole && !isDocs

const basename = isConsole ? '/console' : isDocs ? '/docs' : '/'

function pickRoot() {
  if (isConsole) return <ConsoleApp />
  if (isDocs) return <DocsApp />
  return <LandingApp />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      {pickRoot()}
    </BrowserRouter>
  </StrictMode>,
)

void isLanding
