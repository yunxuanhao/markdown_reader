use tauri::Emitter;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("Markdown Reader").unwrap();

            // Handle files opened via OS file association (passed as CLI args)
            let args: Vec<String> = std::env::args().skip(1).collect();
            if !args.is_empty() {
                let md_paths: Vec<String> = args
                    .into_iter()
                    .filter(|p| p.ends_with(".md") || p.ends_with(".markdown") || p.ends_with(".mdx"))
                    .collect();
                if !md_paths.is_empty() {
                    app.emit("open-files", md_paths).ok();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
