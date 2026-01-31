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
        <a href="/docs">Documentation</a>
        <a href="/docs/filter-query">Filter Query</a>
        <a href="/config">Admin UI</a>
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
