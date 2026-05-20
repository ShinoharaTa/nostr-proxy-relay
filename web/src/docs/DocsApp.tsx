import { useEffect, useState } from 'react';
import { detectInitialLang, persistLang, type LandingLang } from '../landing/i18n';
import { docsText } from './i18n';
import './docs.css';

const ENV_EXAMPLE = `ADMIN_USER=admin
ADMIN_PASS=change-me
DATABASE_URL=sqlite:data/app.sqlite
RUST_LOG=info`;

const START_COMMAND = `# development
cargo run

# production build
cargo build --release
./target/release/proxy-nostr-relay`;

const NGINX_EXAMPLE = `server {
  server_name relay.example.com;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}`;

export function DocsApp() {
  const [lang, setLang] = useState<LandingLang>(() => detectInitialLang());
  const t = docsText[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    persistLang(lang);
  }, [lang]);

  return (
    <div className="docs-page">
      <aside className="docs-sidebar">
        <a className="docs-logo" href="/">
          <span className="docs-logo__mark">NPR</span>
          <span>Proxy Nostr Relay</span>
        </a>
        <nav className="docs-nav" aria-label="Docs navigation">
          <a href="#overview">{t.nav.overview}</a>
          <a href="#getting-started">{t.nav.start}</a>
          <a href="#architecture">{t.nav.architecture}</a>
          <a href="#filtering">{t.nav.filtering}</a>
          <a href="#dsl">{t.nav.dsl}</a>
          <a href="#operations">{t.nav.operations}</a>
          <a href="#api">{t.nav.api}</a>
          <a href="/docs-md">{t.nav.legacy}</a>
        </nav>
        <div className="docs-lang" role="group" aria-label="Language">
          <button className={lang === 'ja' ? 'is-active' : undefined} onClick={() => setLang('ja')}>JA</button>
          <button className={lang === 'en' ? 'is-active' : undefined} onClick={() => setLang('en')}>EN</button>
        </div>
      </aside>

      <main className="docs-main">
        <section className="docs-hero">
          <span className="docs-eyebrow">{t.hero.eyebrow}</span>
          <h1>{t.hero.title}</h1>
          <p>{t.hero.lead}</p>
          <div className="docs-actions">
            <a className="docs-btn docs-btn--primary" href="#getting-started">{t.hero.primary}</a>
            <a className="docs-btn" href="#filtering">{t.hero.secondary}</a>
          </div>
        </section>

        <DocsSection id="overview" title={t.overview.title}>
          <div className="docs-prose">
            {t.overview.body.map((p) => <p key={p}>{p}</p>)}
          </div>
          <div className="docs-card-grid">
            {t.overview.cards.map(([title, body]) => (
              <InfoCard key={title} title={title} body={body} />
            ))}
          </div>
        </DocsSection>

        <DocsSection id="getting-started" title={t.start.title}>
          <div className="docs-steps">
            {t.start.steps.map(([title, body]) => (
              <div className="docs-step" key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <div className="docs-code-grid">
            <CodeBlock title={t.start.envTitle} code={ENV_EXAMPLE} />
            <CodeBlock title={t.start.commandTitle} code={START_COMMAND} />
          </div>
          <CodeBlock title="Nginx / WSS proxy" code={NGINX_EXAMPLE} />
        </DocsSection>

        <DocsSection id="architecture" title={t.architecture.title} lead={t.architecture.lead}>
          <div className="docs-arch">
            {t.architecture.flow.map(([title, body], idx) => (
              <div className="docs-arch__node" key={title}>
                <span>{String(idx + 1).padStart(2, '0')}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <h3>{t.architecture.patternsTitle}</h3>
          <div className="docs-card-grid">
            {t.architecture.patterns.map(([title, body]) => (
              <InfoCard key={title} title={title} body={body} />
            ))}
          </div>
        </DocsSection>

        <DocsSection id="filtering" title={t.filtering.title} lead={t.filtering.lead}>
          <FeatureList items={t.filtering.items} />
        </DocsSection>

        <DocsSection id="dsl" title={t.dsl.title} lead={t.dsl.lead}>
          <div className="docs-table">
            {t.dsl.examples.map(([expr, desc]) => (
              <div className="docs-table__row" key={expr}>
                <code>{expr}</code>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <p className="docs-linkline">
            <a href="/docs-md/filter-query">{t.dsl.link}</a>
          </p>
        </DocsSection>

        <DocsSection id="operations" title={t.operations.title} lead={t.operations.lead}>
          <FeatureList items={t.operations.items} />
          <p className="docs-linkline">
            <a href="/console/">Open admin console</a>
          </p>
        </DocsSection>

        <DocsSection id="api" title={t.api.title} lead={t.api.lead}>
          <FeatureList items={t.api.items} />
          <p className="docs-linkline">
            <a href="/docs-md/api">{t.api.link}</a>
          </p>
        </DocsSection>
      </main>
    </div>
  );
}

function DocsSection({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="docs-section" id={id}>
      <div className="docs-section__header">
        <span className="docs-section__anchor">/{id}</span>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="docs-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function FeatureList({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="docs-feature-list">
      {items.map(([title, body]) => (
        <div className="docs-feature" key={title}>
          <strong>{title}</strong>
          <span>{body}</span>
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <figure className="docs-code">
      <figcaption>{title}</figcaption>
      <pre><code>{code}</code></pre>
    </figure>
  );
}
