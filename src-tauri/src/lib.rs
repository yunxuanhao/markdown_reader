use tauri::Manager;
use std::sync::Mutex;

struct PendingFiles(Mutex<Vec<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture CLI args before the webview starts to avoid a race:
    // the setup() closure runs before the frontend mounts its listener.
    let args: Vec<String> = std::env::args().skip(1).collect();
    let md_paths: Vec<String> = args
        .into_iter()
        .filter(|p| p.ends_with(".md") || p.ends_with(".markdown") || p.ends_with(".mdx"))
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PendingFiles(Mutex::new(md_paths)))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("Markdown Reader").unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_pending_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}
