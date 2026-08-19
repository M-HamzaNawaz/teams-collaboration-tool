// Confide desktop shell — a native window around the deployed web app.
// The product itself (rendering, screening, APIs) lives on Vercel; this
// binary adds what a browser tab can't: its own icon and window, single-
// instance focus, remembered geometry, native notifications + badge (via
// the capability-scoped IPC bridge), external links in the system browser,
// and real file downloads into ~/Downloads.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::webview::DownloadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const APP_URL: &str = "https://teams-collaboration-tool-bwfb.vercel.app";

/// Same-app hosts: production, Vercel previews of this project, Supabase
/// (storage redirects). Everything else opens in the system browser.
fn is_app_host(host: &str) -> bool {
    host == "teams-collaboration-tool-bwfb.vercel.app"
        || (host.starts_with("teams-collaboration-tool-bwfb") && host.ends_with(".vercel.app"))
        || host.ends_with(".supabase.co")
}

/// External-link clicks become same-window navigations so on_navigation can
/// route them to the system browser (target=_blank is inert in a webview).
const INIT_JS: &str = r#"
(function () {
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || anchor.target === '_blank') {
      event.preventDefault();
      location.href = url.href;
    }
  }, true);
})();
"#;

/// Update checks: 15 seconds after launch, then every 5 minutes while the app
/// stays open — a release published mid-day reaches running apps too. If a
/// newer shell exists: one native dialog; "Install now" downloads, verifies
/// the signature against the baked-in public key, installs, and restarts.
/// "Later" mutes THAT version until the next launch (a newer one still
/// prompts). Any network or feed error is silently ignored — an update
/// check must never bother a working app.
static PROMPT_OPEN: AtomicBool = AtomicBool::new(false);
static DECLINED_VERSION: Mutex<Option<String>> = Mutex::new(None);

async fn check_for_updates(app: tauri::AppHandle) {
    if PROMPT_OPEN.load(Ordering::SeqCst) {
        return; // a dialog is already on screen — never stack another
    }
    let Ok(updater) = app.updater() else { return };
    let Ok(Some(update)) = updater.check().await else {
        return;
    };
    let version = update.version.clone();
    if let Ok(declined) = DECLINED_VERSION.lock() {
        if declined.as_deref() == Some(version.as_str()) {
            return; // the user said "Later" to exactly this version
        }
    }
    PROMPT_OPEN.store(true, Ordering::SeqCst);
    let app_for_restart = app.clone();
    let declined_version = version.clone();
    app.dialog()
        .message(format!(
            "Confide {version} is ready to install.\nThe app restarts when it finishes."
        ))
        .title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install now".to_string(),
            "Later".to_string(),
        ))
        .show(move |install| {
            PROMPT_OPEN.store(false, Ordering::SeqCst);
            if !install {
                if let Ok(mut declined) = DECLINED_VERSION.lock() {
                    *declined = Some(declined_version);
                }
                return;
            }
            tauri::async_runtime::spawn(async move {
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    app_for_restart.restart();
                }
            });
        });
}

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let update_handle = app.handle().clone();
            std::thread::spawn(move || {
                // First check shortly after launch, then every 5 minutes
                // while the app stays open — a release reaches running
                // apps within minutes, not on next restart.
                std::thread::sleep(std::time::Duration::from_secs(15));
                loop {
                    tauri::async_runtime::block_on(check_for_updates(
                        update_handle.clone(),
                    ));
                    std::thread::sleep(std::time::Duration::from_secs(5 * 60));
                }
            });

            let nav_handle = app.handle().clone();
            let dl_handle = app.handle().clone();

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(APP_URL.parse().expect("valid app url")),
            )
            .title("Confide")
            .inner_size(1280.0, 840.0)
            .min_inner_size(900.0, 600.0)
            .center()
            .initialization_script(INIT_JS)
            .on_navigation(move |url| {
                match url.scheme() {
                    "http" | "https" => {
                        if is_app_host(url.host_str().unwrap_or("")) {
                            true
                        } else {
                            let _ = nav_handle
                                .opener()
                                .open_url(url.to_string(), None::<String>);
                            false
                        }
                    }
                    // mailto: and friends belong to the OS too.
                    "mailto" | "tel" => {
                        let _ = nav_handle
                            .opener()
                            .open_url(url.to_string(), None::<String>);
                        false
                    }
                    _ => true, // tauri/devtools internals
                }
            })
            .on_download(move |webview, event| {
                match event {
                    DownloadEvent::Requested { url, destination } => {
                        // Name from the URL path; the query string carries
                        // signing tokens, never the filename.
                        let name = url
                            .path_segments()
                            .and_then(|mut s| s.next_back().map(String::from))
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "confide-download".into());
                        let dir = webview
                            .app_handle()
                            .path()
                            .download_dir()
                            .unwrap_or_else(|_| std::env::temp_dir());
                        // Never overwrite: "name", "name (1)", "name (2)"…
                        let mut path = dir.join(&name);
                        let mut counter = 1;
                        while path.exists() {
                            path = dir.join(format!("({counter}) {name}"));
                            counter += 1;
                        }
                        *destination = path;
                    }
                    DownloadEvent::Finished { success, path, .. } => {
                        let text = if success {
                            match path.and_then(|p| {
                                p.file_name().map(|n| n.to_string_lossy().into_owned())
                            }) {
                                Some(n) => format!("{n} saved to Downloads"),
                                None => "File saved to Downloads".into(),
                            }
                        } else {
                            "Download failed".into()
                        };
                        let _ = dl_handle
                            .notification()
                            .builder()
                            .title("Confide")
                            .body(text)
                            .show();
                    }
                    _ => {}
                }
                true
            })
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Confide");
}
