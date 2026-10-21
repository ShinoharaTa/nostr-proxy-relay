import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { usePalette } from '../palette/CommandPalette';
import { extractShared } from '../utils/nostrId';

/**
 * PWA の共有ターゲット（#55）。Nostr クライアントから共有された文字列から識別子を取り出し、
 * パレットに貼った状態で開く。画面自体はホームに戻す。
 */
export function ShareTarget() {
  const [params] = useSearchParams();
  const palette = usePalette();
  const shared = extractShared([params.get('text'), params.get('url'), params.get('title')]);
  useEffect(() => {
    palette.open(shared ?? '', true);
    // 共有は 1 回だけ処理する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Navigate to="/" replace />;
}
