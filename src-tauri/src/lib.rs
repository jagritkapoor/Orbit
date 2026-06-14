use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(target_os = "macos")]
fn setup_notification_delegate() {
    use objc2::runtime::{AnyClass, AnyObject, AnyProtocol, ClassBuilder, Sel};
    use objc2::sel;
    use std::sync::Once;

    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        // UNNotificationPresentationOptions bit flags:
        // Sound=1, Alert=2, Banner=4, List=8
        // Use all four so banners appear on macOS 10.15 (alert) and 11+ (banner+list)
        const PRESENT_OPTIONS: usize = 1 | 2 | 4 | 8;

        unsafe extern "C-unwind" fn will_present(
            _this: &AnyObject,
            _cmd: Sel,
            _center: *mut AnyObject,
            _notification: *mut AnyObject,
            completion_handler: *const block2::Block<dyn Fn(usize)>,
        ) {
            if let Some(handler) = unsafe { completion_handler.as_ref() } {
                handler.call((PRESENT_OPTIONS,));
            }
        }

        unsafe {
            let ns_object = AnyClass::get(c"NSObject").expect("NSObject not found");
            let mut builder = ClassBuilder::new(c"OrbitNotifDelegate", ns_object)
                .expect("OrbitNotifDelegate class already registered");

            if let Some(proto) = AnyProtocol::get(c"UNUserNotificationCenterDelegate") {
                builder.add_protocol(proto);
            }

            builder.add_method(
                sel!(userNotificationCenter:willPresentNotification:withCompletionHandler:),
                will_present as unsafe extern "C-unwind" fn(_, _, _, _, _),
            );

            let cls = builder.register();

            // Instantiate delegate and set on UNUserNotificationCenter
            let center_cls = AnyClass::get(c"UNUserNotificationCenter")
                .expect("UNUserNotificationCenter not found");
            let center: *mut AnyObject =
                objc2::msg_send![center_cls, currentNotificationCenter];
            let delegate: *mut AnyObject = objc2::msg_send![cls, new];
            let _: () = objc2::msg_send![center, setDelegate: delegate];
            // Leak delegate — must live for app lifetime
            std::mem::forget(Box::from_raw(delegate));
        }
    });
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn hide_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("db/migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_timer_phase",
            sql: include_str!("db/migrations/002_add_timer_phase.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:orbit.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Hide from Dock and Cmd+Tab — menubar-only app
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Force notification banners even when Orbit is considered foreground
            #[cfg(target_os = "macos")]
            setup_notification_delegate();

            // System tray
            let quit = MenuItem::with_id(app, "quit", "Quit Orbit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            let icon_bytes = include_bytes!("../icons/32x32.png");
            let img = image::load_from_memory(icon_bytes)
                .expect("failed to decode tray icon")
                .to_rgba8();
            let (w, h) = img.dimensions();
            let tray_icon = tauri::image::Image::new_owned(img.into_raw(), w, h);

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if app
                            .get_webview_window("main")
                            .and_then(|w| w.is_visible().ok())
                            .unwrap_or(false)
                        {
                            hide_window(app);
                        } else {
                            show_window(app);
                        }
                    }
                })
                .build(app)?;

            // Window setup
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            window.set_visible_on_all_workspaces(true)?;

            // On Windows, titleBarStyle:"Overlay" is a no-op — remove native
            // decorations so our React title bar is the only one.
            #[cfg(target_os = "windows")]
            window.set_decorations(false)?;

            // Intercept close button, focus loss — hide instead of quit/close
            // Grace period prevents the startup focus-loss event from immediately hiding the window
            let ready = Arc::new(AtomicBool::new(false));
            let ready_clone = ready.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                ready_clone.store(true, Ordering::Relaxed);
            });

            let win_close = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win_close.hide();
                    }
                    tauri::WindowEvent::Focused(false) => {
                        if ready.load(Ordering::Relaxed) {
                            let _ = win_close.hide();
                        }
                    }
                    _ => {}
                }
            });

            // Global shortcut: Cmd+Shift+Space → toggle window
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(
                "CommandOrControl+Shift+Space",
                move |_app, _shortcut, event| {
                    // Only toggle on keydown — the handler fires on both press and release
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if app_handle
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false)
                    {
                        hide_window(&app_handle);
                    } else {
                        show_window(&app_handle);
                    }
                },
            )?;

            // Accessory-policy apps don't activate automatically on launch — show and focus explicitly
            let _ = window.show();
            let _ = window.set_focus();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
