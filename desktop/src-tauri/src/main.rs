// Confide desktop shell — a native window around the deployed web app.
// The product itself (rendering, screening, APIs) lives on Vercel; this
// binary adds what a browser tab can't: its own icon and window, single-
// instance focus, remembered window geometry, and (Phase 2) native
// notifications + unread badges.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // Must be first: a second launch hands its argv to the running
        // instance, which we answer by focusing the existing window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running Confide");
}
