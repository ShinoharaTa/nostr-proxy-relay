//! Documentation server - serves Markdown files as HTML

use axum::{
    extract::Path,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use pulldown_cmark::{html, Options, Parser};

/// Create the documentation router (public, no auth required)
pub fn router() -> Router {
    Router::new()
        .route("/", get(serve_index))
        .route("/:page", get(serve_page))
}

/// Landing page configuration
#[derive(Clone)]
pub struct LandingPageConfig {
    pub relay_url: String,
    pub github_url: String,
}

impl Default for LandingPageConfig {
    fn default() -> Self {
        Self {
            relay_url: "wss://your-relay.example.com".to_string(),
            github_url: "{{GITHUB_URL}}".to_string(),
        }
    }
}

/// Serve the landing page (for root path "/")
pub fn serve_landing_page(config: &LandingPageConfig) -> impl IntoResponse {
    Html(landing_page_template(config))
}

/// Landing page HTML template with modern design
fn landing_page_template(config: &LandingPageConfig) -> String {
    let html = r#"<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Proxy Nostr Relay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #a855f7;
            --primary-dark: #7c3aed;
            --accent: #22d3ee;
            --bg-dark: #0a0a0f;
            --bg-card: rgba(255, 255, 255, 0.03);
            --text: #e4e4e7;
            --text-muted: #a1a1aa;
            --border: rgba(255, 255, 255, 0.1);
            --glow: rgba(168, 85, 247, 0.4);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg-dark);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        /* Animated background */
        .bg-grid {
            position: fixed;
            inset: 0;
            background-image: 
                linear-gradient(rgba(168, 85, 247, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(168, 85, 247, 0.03) 1px, transparent 1px);
            background-size: 60px 60px;
            mask-image: radial-gradient(ellipse 80% 50% at 50% 0%, black 70%, transparent 100%);
            z-index: 0;
        }
        
        .bg-glow {
            position: fixed;
            top: -50%;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            height: 100%;
            background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(168, 85, 247, 0.15), transparent 60%);
            z-index: 0;
            animation: pulse 8s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        .container {
            position: relative;
            z-index: 1;
            max-width: 1100px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        /* Hero Section */
        .hero {
            min-height: 70vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 4rem 0;
        }
        
        .hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 100px;
            font-size: 0.875rem;
            color: var(--text-muted);
            margin-bottom: 2rem;
            animation: fadeInUp 0.6s ease-out;
        }
        
        .hero-badge span {
            color: var(--accent);
        }
        
        .hero h1 {
            font-size: clamp(2.5rem, 8vw, 4.5rem);
            font-weight: 700;
            line-height: 1.1;
            margin-bottom: 1.5rem;
            animation: fadeInUp 0.6s ease-out 0.1s both;
        }
        
        .hero h1 .gradient {
            background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .hero p {
            font-size: 1.25rem;
            color: var(--text-muted);
            max-width: 600px;
            margin-bottom: 2.5rem;
            animation: fadeInUp 0.6s ease-out 0.2s both;
        }
        
        .hero-buttons {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
            animation: fadeInUp 0.6s ease-out 0.3s both;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 1.75rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 1rem;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
            color: white;
            box-shadow: 0 0 30px var(--glow);
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 0 50px var(--glow);
        }
        
        .btn-secondary {
            background: var(--bg-card);
            border: 1px solid var(--border);
            color: var(--text);
        }
        
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--primary);
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Connection Box */
        .connect-box {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.5rem 2rem;
            margin: 3rem auto;
            max-width: 500px;
            text-align: center;
            animation: fadeInUp 0.6s ease-out 0.4s both;
        }
        
        .connect-box h3 {
            font-size: 0.875rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 1rem;
        }
        
        .connect-url {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.1rem;
            color: var(--accent);
            background: rgba(34, 211, 238, 0.1);
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            border: 1px solid rgba(34, 211, 238, 0.2);
        }
        
        /* Features Section */
        .features {
            padding: 4rem 0;
        }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
        }
        
        .feature-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 2rem;
            transition: all 0.3s ease;
            animation: fadeInUp 0.6s ease-out both;
        }
        
        .feature-card:nth-child(1) { animation-delay: 0.1s; }
        .feature-card:nth-child(2) { animation-delay: 0.2s; }
        .feature-card:nth-child(3) { animation-delay: 0.3s; }
        .feature-card:nth-child(4) { animation-delay: 0.4s; }
        
        .feature-card:hover {
            border-color: var(--primary);
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        
        .feature-card h3 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
        }
        
        .feature-card p {
            color: var(--text-muted);
            font-size: 0.95rem;
            line-height: 1.6;
        }
        
        /* Access Table */
        .access-section {
            padding: 3rem 0;
        }
        
        .access-table {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            overflow: hidden;
            max-width: 500px;
            margin: 0 auto;
        }
        
        .access-row {
            display: flex;
            justify-content: space-between;
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid var(--border);
        }
        
        .access-row:last-child {
            border-bottom: none;
        }
        
        .access-row .label {
            font-family: 'JetBrains Mono', monospace;
            color: var(--text);
        }
        
        .access-row .value {
            color: var(--text-muted);
        }
        
        .value.open {
            color: #22c55e;
        }
        
        .value.restricted {
            color: #f59e0b;
        }
        
        /* Links Section */
        .links-section {
            padding: 4rem 0;
            text-align: center;
        }
        
        .links-section h2 {
            font-size: 1.5rem;
            margin-bottom: 2rem;
            color: var(--text-muted);
        }
        
        .links-grid {
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .link-card {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.5rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            color: var(--text);
            text-decoration: none;
            transition: all 0.3s ease;
        }
        
        .link-card:hover {
            border-color: var(--primary);
            background: rgba(168, 85, 247, 0.1);
        }
        
        .link-card svg {
            width: 20px;
            height: 20px;
            fill: currentColor;
        }
        
        /* Footer */
        footer {
            text-align: center;
            padding: 3rem 0;
            color: var(--text-muted);
            font-size: 0.875rem;
            border-top: 1px solid var(--border);
        }
        
        footer a {
            color: var(--primary);
            text-decoration: none;
        }
        
        footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="bg-grid"></div>
    <div class="bg-glow"></div>
    
    <div class="container">
        <section class="hero">
            <div class="hero-badge">
                <span>⚡</span> Nostr Proxy Relay
            </div>
            <h1>
                クリーンな<br>
                <span class="gradient">タイムライン</span>を。
            </h1>
            <p>
                Botや不要な投稿を自動フィルタリング。<br>
                SQLライクなDSLで自由にルールを設定できます。
            </p>
            <div class="hero-buttons">
                <a href="/docs" class="btn btn-primary">
                    📚 ドキュメント
                </a>
                <a href="{{GITHUB_URL}}" class="btn btn-secondary" target="_blank">
                    ⭐ GitHub
                </a>
            </div>
            
            <div class="connect-box">
                <h3>リレー接続</h3>
                <code class="connect-url">{{RELAY_URL}}</code>
            </div>
        </section>
        
        <section class="features">
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">🛡️</div>
                    <h3>Bot対策</h3>
                    <p>Kind 6/7のBot投稿を自動検出。参照先と同じタイムスタンプの投稿をブロック。</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📝</div>
                    <h3>Filter Query DSL</h3>
                    <p>SQLライクな構文でフィルタを記述。正規表現、タグベースフィルタに対応。</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">🔐</div>
                    <h3>セーフリスト</h3>
                    <p>信頼できるnpubを登録してフィルタをバイパス。投稿権限も個別に設定可能。</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <h3>ログ・統計</h3>
                    <p>接続ログ、拒否ログを記録。どの投稿がブロックされているか可視化。</p>
                </div>
            </div>
        </section>
        
        <section class="access-section">
            <div class="access-table">
                <div class="access-row">
                    <span class="label">REQ（読み取り）</span>
                    <span class="value open">公開</span>
                </div>
                <div class="access-row">
                    <span class="label">EVENT（投稿）</span>
                    <span class="value restricted">セーフリスト限定</span>
                </div>
            </div>
        </section>
        
        <section class="links-section">
            <h2>もっと詳しく</h2>
            <div class="links-grid">
                <a href="/docs" class="link-card">
                    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h6v6h6v10H6z"/></svg>
                    ドキュメント
                </a>
                <a href="/docs/filter-query" class="link-card">
                    <svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
                    Filter Query 仕様
                </a>
                <a href="{{GITHUB_URL}}" class="link-card" target="_blank">
                    <svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.8 1.31 3.48 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
                    GitHub
                </a>
                <a href="https://github.com/nostr-protocol/nips" class="link-card" target="_blank">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    Nostr NIPs
                </a>
            </div>
        </section>
    </div>
    
    <footer>
        <p>Powered by <a href="{{GITHUB_URL}}">Proxy Nostr Relay</a></p>
    </footer>
</body>
</html>"#;
    
    // Replace placeholders with actual values
    html.replace("{{RELAY_URL}}", &config.relay_url)
        .replace("{{GITHUB_URL}}", &config.github_url)
}

/// HTML template for documentation pages
fn html_template(title: &str, content: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Proxy Nostr Relay</title>
    <style>
        :root {{
            --bg-color: #0d1117;
            --text-color: #c9d1d9;
            --heading-color: #58a6ff;
            --link-color: #58a6ff;
            --code-bg: #161b22;
            --border-color: #30363d;
            --table-bg: #161b22;
        }}
        
        * {{
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            background-color: var(--bg-color);
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
        }}
        
        h1, h2, h3, h4 {{
            color: var(--heading-color);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.3rem;
            margin-top: 1.5rem;
        }}
        
        h1 {{
            font-size: 2rem;
        }}
        
        h2 {{
            font-size: 1.5rem;
        }}
        
        h3 {{
            font-size: 1.2rem;
        }}
        
        a {{
            color: var(--link-color);
            text-decoration: none;
        }}
        
        a:hover {{
            text-decoration: underline;
        }}
        
        code {{
            background-color: var(--code-bg);
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 0.9em;
        }}
        
        pre {{
            background-color: var(--code-bg);
            padding: 1rem;
            border-radius: 6px;
            overflow-x: auto;
            border: 1px solid var(--border-color);
        }}
        
        pre code {{
            background: none;
            padding: 0;
            font-size: 0.85em;
            line-height: 1.5;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }}
        
        th, td {{
            padding: 0.75rem;
            text-align: left;
            border: 1px solid var(--border-color);
        }}
        
        th {{
            background-color: var(--table-bg);
            font-weight: 600;
        }}
        
        tr:nth-child(even) {{
            background-color: var(--table-bg);
        }}
        
        blockquote {{
            border-left: 4px solid var(--border-color);
            padding-left: 1rem;
            margin-left: 0;
            color: #8b949e;
        }}
        
        ul, ol {{
            padding-left: 2rem;
        }}
        
        li {{
            margin: 0.25rem 0;
        }}
        
        hr {{
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 2rem 0;
        }}
        
        .nav {{
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
        }}
        
        .nav a {{
            margin-right: 1.5rem;
        }}
        
        .footer {{
            margin-top: 3rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
            color: #8b949e;
            font-size: 0.9rem;
        }}
    </style>
</head>
<body>
    <nav class="nav">
        <a href="/">Home</a>
        <a href="/docs">Documentation</a>
        <a href="/docs/filter-query">Filter Query</a>
    </nav>
    
    <main>
        {content}
    </main>
    
    <footer class="footer">
        <p>Proxy Nostr Relay Documentation</p>
    </footer>
</body>
</html>"#,
        title = title,
        content = content
    )
}

/// Render Markdown to HTML
fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    
    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    
    html_output
}

/// Serve the documentation index page
async fn serve_index() -> impl IntoResponse {
    serve_doc("index").await
}

/// Serve a documentation page by name
async fn serve_page(Path(page): Path<String>) -> impl IntoResponse {
    serve_doc(&page).await
}

/// Load and render a documentation file
async fn serve_doc(name: &str) -> impl IntoResponse {
    // Sanitize the page name to prevent directory traversal
    let safe_name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    
    if safe_name.is_empty() {
        return Html(html_template("Not Found", "<h1>404 - Page Not Found</h1>"));
    }
    
    let file_path = format!("docs/{}.md", safe_name);
    
    match std::fs::read_to_string(&file_path) {
        Ok(markdown) => {
            let html_content = render_markdown(&markdown);
            let title = extract_title(&markdown).unwrap_or_else(|| safe_name.clone());
            Html(html_template(&title, &html_content))
        }
        Err(_) => {
            Html(html_template(
                "Not Found",
                "<h1>404 - Page Not Found</h1><p>The requested documentation page was not found.</p>",
            ))
        }
    }
}

/// Extract the title from the first H1 heading in the Markdown
fn extract_title(markdown: &str) -> Option<String> {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_markdown() {
        let md = "# Hello\n\nThis is **bold** text.";
        let html = render_markdown(md);
        assert!(html.contains("<h1>Hello</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
    }

    #[test]
    fn test_extract_title() {
        let md = "# My Title\n\nSome content";
        assert_eq!(extract_title(md), Some("My Title".to_string()));
    }

    #[test]
    fn test_extract_title_none() {
        let md = "No heading here";
        assert_eq!(extract_title(md), None);
    }
}
