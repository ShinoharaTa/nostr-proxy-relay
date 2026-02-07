export function MetricsSettingsSection() {
  return (
    <div className="section">
      <h2>Metrics (InfluxDB)</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Optionally export metrics to InfluxDB 2.x for monitoring and dashboards.
      </p>
      <div className="info-box">
        <h4>Environment variables</h4>
        <p>Set the following in the server environment to enable export. If any is unset, no metrics are sent.</p>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li><code>INFLUXDB_URL</code> – InfluxDB server URL (e.g. https://influx.example.com)</li>
          <li><code>INFLUXDB_TOKEN</code> – API token with write access</li>
          <li><code>INFLUXDB_BUCKET</code> – Bucket name</li>
          <li><code>INFLUXDB_ORG</code> – Organization name or ID</li>
        </ul>
        <p style={{ marginTop: '0.75rem' }}>Metrics sent every 10 seconds: <code>relay_connections_total</code>, <code>relay_connections_active</code>, <code>relay_rejections_total</code>, <code>relay_pool_status</code> (per relay).</p>
      </div>
    </div>
  );
}
