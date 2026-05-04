import { LandingPage } from './LandingPage';
import './landing.css';

/**
 * 公開 LP のエントリ。Router 不要 (1 ページのみ)。
 */
export function LandingApp() {
  return <LandingPage />;
}
