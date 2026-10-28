//! Browser glue supplies device inputs and storage only. All game rules stay in Rust.
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn nick_input(index: i32) -> f32;
    fn nick_storage_get(key: i32) -> f64;
    fn nick_storage_set(key: i32, value: f64);
    fn nick_fullscreen();
    fn nick_exit_game();
    fn nick_selected_game() -> i32;
    fn nick_debug_state(ptr: *const u8, len: usize);
}
pub fn input(index: i32) -> f32 {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        return nick_input(index);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = index;
        0.
    }
}
#[cfg(not(target_arch = "wasm32"))]
fn storage_path(key: i32) -> std::path::PathBuf {
    let root = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|p| std::path::PathBuf::from(p).join(".local/share"))
        })
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from))
        .unwrap_or_else(std::env::temp_dir)
        .join("nick-rust");
    let _ = std::fs::create_dir_all(&root);
    root.join(format!("{key}.txt"))
}
pub fn get(key: i32) -> f64 {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        return nick_storage_get(key);
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let p = storage_path(key);
        std::fs::read_to_string(p)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.)
    }
}
pub fn set(key: i32, value: f64) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nick_storage_set(key, value)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let p = storage_path(key);
        let _ = std::fs::write(p, value.to_string());
    }
}
pub fn fullscreen() {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nick_fullscreen()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        static FULL: AtomicBool = AtomicBool::new(false);
        let value = !FULL.fetch_xor(true, Ordering::Relaxed);
        macroquad::window::set_fullscreen(value);
    }
}
pub fn game() -> i32 {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        return nick_selected_game();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        if std::env::args().any(|s| s == "--stupor-highway") {
            1
        } else {
            0
        }
    }
}
pub fn debug(value: &str) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nick_debug_state(value.as_ptr(), value.len())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = value;
    }
}

pub fn exit_game() {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        nick_exit_game();
    }
    #[cfg(not(target_arch = "wasm32"))]
    std::process::exit(0);
}
