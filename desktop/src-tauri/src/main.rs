// Desktop entry point. Everything lives in lib.rs so the same app can be
// loaded as a cdylib by the Android build (tauri::mobile_entry_point).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    confide_desktop_lib::run()
}
