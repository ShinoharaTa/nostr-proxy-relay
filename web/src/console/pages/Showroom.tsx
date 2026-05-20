import { useState } from 'react';
import {
  Button, Card, KpiTile, StatusDot, Tag, ModeBadge, Pill, DataList,
  Modal, Drawer, EmptyState, LoadingState, HeadlineGlitch, Icon,
  useToast,
  type Column,
} from '../primitives';
import { ICON_PATHS } from '../icons/paths';

interface Sample { ip: string; mode: string; reason: string; }
const SAMPLE_ROWS: Sample[] = [
  { ip: '203.0.113.42', mode: 'hard',   reason: 'mass spam' },
  { ip: '198.51.100.7', mode: 'shadow', reason: 'phishing'  },
  { ip: '10.0.0.0/8',   mode: 'whitelist', reason: 'office' },
];

const SAMPLE_COLS: Column<Sample>[] = [
  { key: 'ip',     label: 'TARGET',   render: (r) => <code>{r.ip}</code> },
  { key: 'mode',   label: 'MODE',     render: (r) => <ModeBadge mode={r.mode as any} /> },
  { key: 'reason', label: 'REASON',   render: (r) => r.reason },
  { key: 'act',    label: 'ACTION',   render: () => <Button variant="ghost" iconOnly aria-label="disconnect"><Icon name="disconnect" /></Button> },
];

/** PROFILER (WD1 ctOS) Showroom.
 *  - 装飾を最小化したコンポーネント一覧。
 *  - グリッチ・ステンシル・スカルは出さない。
 *  - "ds-skull" アイコンはコード上残しているが、Showroom の icon grid からは除外する。
 */
export function Showroom() {
  const [tab, setTab] = useState('1h');
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Card title={<>HEADLINES <span className="crt-hud-tag crt-hud-tag--accent">profiler</span></>} bracket>
        <div style={{ display: 'grid', gap: 8 }}>
          <HeadlineGlitch as="h1" accent>Nostr Proxy Relay — Profiler</HeadlineGlitch>
          <HeadlineGlitch as="h2">Secondary title</HeadlineGlitch>
          <HeadlineGlitch as="h3">Tertiary, plain</HeadlineGlitch>
        </div>
      </Card>

      <Card title="BUTTONS">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button iconOnly aria-label="add"><Icon name="plus" /></Button>
          <Button iconOnly variant="danger" aria-label="ban"><Icon name="ban" /></Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      <Card title="STATUS / TAGS / MODE">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusDot variant="live">Live</StatusDot>
          <StatusDot variant="warn">Degraded</StatusDot>
          <StatusDot variant="alert">Down</StatusDot>
          <StatusDot variant="idle">Idle</StatusDot>
          <Tag variant="info">INFO</Tag>
          <Tag variant="warn">WARN</Tag>
          <Tag variant="alert">ALERT</Tag>
          <Tag variant="accent">ACCENT</Tag>
          <ModeBadge mode="hard" />
          <ModeBadge mode="shadow" />
          <ModeBadge mode="whitelist" />
          <ModeBadge mode="temp" />
        </div>
      </Card>

      <Card title="KPI TILES">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <KpiTile label="ACTIVE CONN"     value="1284" delta={<><Icon name="arrow-up" size={12} /> +12% / 5m</>} variant="ok" />
          <KpiTile label="EVENTS / MIN"    value="9432" delta={<><Icon name="arrow-up" size={12} /> +203</>} />
          <KpiTile label="REJECT RATE"     value="2.1%" variant="warn" />
          <KpiTile label="BACKEND DOWN"    value="1"    variant="alert" />
        </div>
      </Card>

      <Card title="PILL / TABS">
        <Pill
          items={['15m','1h','6h','24h','7d'].map((p) => ({ id: p, label: p }))}
          active={tab}
          onChange={setTab}
        />
      </Card>

      <Card title="DATALIST (ip-acl sample)" bracket>
        <DataList
          columns={SAMPLE_COLS}
          rows={SAMPLE_ROWS}
          rowKey={(r) => r.ip}
          emptyTitle="NO ENTRIES"
        />
      </Card>

      <Card title="OVERLAYS">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button onClick={() => toast.push({ title: 'INFO', message: 'これはトーストです', variant: 'ok' })}>Toast ok</Button>
          <Button onClick={() => toast.push({ title: 'WARN', message: '注意イベントが発生', variant: 'warn' })}>Toast warn</Button>
          <Button onClick={() => toast.push({ title: 'ALERT', message: '異常です', variant: 'alert' })}>Toast alert</Button>
        </div>
      </Card>

      <Card title="EMPTY / LOADING">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <EmptyState title="No traffic yet" hint="クライアントが接続するとここに表示されます" />
          <LoadingState title="Fetching" hint="120 件取得中..." />
        </div>
      </Card>

      <Card title={`ICONS (${Object.keys(ICON_PATHS).filter(n => n !== 'ds-skull').length})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {Object.keys(ICON_PATHS).filter(n => n !== 'ds-skull').map((name) => (
            <div
              key={name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--crt-border)',
                padding: 10,
                fontSize: 11,
                color: 'var(--crt-fg-dim)',
                fontFamily: 'var(--crt-font-mono)',
              }}
            >
              <Icon name={name as any} size={28} color="var(--crt-accent)" />
              {name}
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={modal}
        title="Confirm action"
        onClose={() => setModal(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => setModal(false)}>Confirm</Button>
        </>}
      >
        この処理は取り消せません。続行しますか？
      </Modal>

      <Drawer open={drawer} title="Details" onClose={() => setDrawer(false)}>
        <p>右からスライドインする Drawer のサンプルです。</p>
        <p>長文の詳細 / フォーム配置を想定。</p>
      </Drawer>
    </div>
  );
}
