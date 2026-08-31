import { useEffect, useState } from 'react';
import { Card, Button, Tag, useToast } from '../primitives';
import { Telemetry as TelemetryApi } from '../api';
import type { TelemetryStatusResponse, TelemetryTestResponse } from '../api';
import { useI18n } from '../i18n';

export function TelemetryPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<TelemetryStatusResponse | null>(null);
  const [testResult, setTestResult] = useState<TelemetryTestResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { TelemetryApi.status().then(setStatus).catch(() => undefined); }, []);

  const runTest = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await TelemetryApi.test();
      setTestResult(r);
      toast.push({
        variant: r.ok ? 'ok' : 'alert',
        message: r.ok ? 'InfluxDB write succeeded' : 'InfluxDB test failed',
      });
    } catch (e) {
      toast.push({ variant: 'alert', message: `${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>TELEMETRY <Tag variant={status?.configured ? 'info' : 'dim'}>{status?.configured ? 'CONFIGURED' : 'OFF'}</Tag></>}>
        {status ? (
          <>
            <p className="muted">{t.telemetry.influxNote}</p>
            <dl className="kv-grid">
              <dt>URL</dt>          <dd><code>{status.url    ?? '—'}</code></dd>
              <dt>BUCKET</dt>       <dd><code>{status.bucket ?? '—'}</code></dd>
              <dt>ORG</dt>          <dd><code>{status.org    ?? '—'}</code></dd>
              <dt>TOKEN</dt>        <dd><code>{status.token_hint ?? '—'}</code></dd>
            </dl>
          </>
        ) : (
          <p className="muted">loading…</p>
        )}
      </Card>

      <Card title={<>CONNECTION TEST</>}
        actions={<Button variant="primary" onClick={runTest} disabled={busy || !status?.configured}>{busy ? '…' : 'TEST WRITE'}</Button>}
      >
        <p className="muted">{t.telemetry.testNote}</p>
        {testResult && (
          <Card
            title={<>RESULT <Tag variant={testResult.ok ? 'info' : 'alert'}>{testResult.ok ? 'OK' : 'FAIL'}</Tag></>}
            bracket
          >
            <dl className="kv-grid">
              <dt>HTTP</dt>    <dd>{testResult.status_code ?? '—'}</dd>
              <dt>MESSAGE</dt> <dd>{testResult.message}</dd>
            </dl>
          </Card>
        )}
      </Card>
    </div>
  );
}
