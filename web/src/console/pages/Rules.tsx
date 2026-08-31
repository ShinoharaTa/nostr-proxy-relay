import { useState } from 'react';
import { Card, Pill } from '../primitives';
import { DslRulesPanel } from './DslRules';
import { QuickBanPanel } from './QuickBan';
import { useI18n } from '../i18n';

type Mode = 'dsl' | 'quick';

/**
 * DSL ルール（Issue #29）。
 * Quick BAN は「GUI で組める簡易 DSL」であり相互変換 API もあるため、
 * 別ページに分けず同じ画面のタブとして置く。
 */
export function RulesPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('dsl');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>{t.rules.title} <span className="crt-hud-tag">{mode === 'dsl' ? 'DSL' : 'Quick BAN'}</span></>}
        actions={
          <Pill
            items={[
              { id: 'dsl', label: 'DSL' },
              { id: 'quick', label: 'QUICK BAN' },
            ]}
            active={mode}
            onChange={(v) => setMode(v as Mode)}
            ariaLabel="rule mode"
          />
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          {mode === 'dsl' ? t.rules.dslHint : t.rules.quickHint}
        </p>
      </Card>

      {mode === 'dsl' ? <DslRulesPanel /> : <QuickBanPanel />}
    </div>
  );
}
