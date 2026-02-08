use std::process::Command;
use std::path::Path;

fn main() {
    // web/dist の変更を検知して再ビルドをトリガーする
    println!("cargo:rerun-if-changed=web/dist");

    // Only build frontend if web/dist doesn't exist
    let dist_path = Path::new("web/dist");
    
    if !dist_path.exists() {
        println!("cargo:warning=web/dist not found, attempting to build frontend...");
        
        // Check if npm is available
        if Command::new("npm").arg("--version").output().is_err() {
            println!("cargo:warning=npm not found, skipping frontend build");
            println!("cargo:warning=Please run 'cd web && npm ci && npm run build' manually");
            return;
        }
        
        // Run npm ci
        let npm_ci = Command::new("npm")
            .args(&["ci"])
            .current_dir("web")
            .output();
        
        if let Err(e) = npm_ci {
            println!("cargo:warning=npm ci failed: {}", e);
            return;
        }
        
        // Run npm run build
        let npm_build = Command::new("npm")
            .args(&["run", "build"])
            .current_dir("web")
            .output();
        
        if let Err(e) = npm_build {
            println!("cargo:warning=npm run build failed: {}", e);
            return;
        }
        
        if let Ok(output) = npm_build {
            if !output.status.success() {
                println!("cargo:warning=Frontend build failed");
                eprintln!("{}", String::from_utf8_lossy(&output.stderr));
            }
        }
    }
}
