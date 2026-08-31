import { useState } from 'react';
import { Card, Pill } from '../primitives';
import { NpubPanel } from './Npub';
import { IpAclPanel } from './IpAcl';
import { useI18n } from '../i18n';

type Target = 'npub' | 'ip';

/**
 * ブロック（Issue #29）。
 *
 * 以前は npub の BAN が ACCESS › NPUB、IP の BAN が ACCESS › IP ACL、
 * さらに Quick BAN が FILTERING と 3 箇所に分散していた。
 * 「誰かを止めたい」という 1 つの意図に対して画面が割れているのが分かりにくさの原因だったため、
 * npub / IP をタブで束ねてここに集約する。
 */
export function BlockPage() {
  const { t } = useI18n();
  const [target, setTarget] = useState<Target>('npub');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>{t.block.title} <span className="crt-hud-tag">{target === 'npub' ? 'npub' : 'IP / CIDR'}</span></>}
        actions={
          <Pill
            items={[
              { id: 'npub', label: 'NPUB' },
              { id: 'ip', label: 'IP / CIDR' },
            ]}
            active={target}
            onChange={(v) => setTarget(v as Target)}
            ariaLabel="block target"
          />
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          {target === 'npub' ? t.block.npubHint : t.block.ipHint}
        </p>
      </Card>

      {target === 'npub' ? <NpubPanel /> : <IpAclPanel />}
    </div>
  );
}
