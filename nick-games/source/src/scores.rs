//! The original local backend keeps ten named scores per mode and difficulty.
use crate::platform;
pub const PAGES: [(u8, u8); 7] = [(1, 1), (1, 2), (1, 3), (0, 1), (0, 2), (0, 3), (2, 2)];
#[derive(Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub score: i32,
}
fn text(key: i32) -> String {
    let mut bytes = Vec::new();
    for i in 0..8 {
        bytes.extend_from_slice(&(platform::get(key + i) as u32).to_le_bytes());
    }
    let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}
fn save_text(key: i32, name: &str) {
    let mut bytes = [0; 32];
    for (to, from) in bytes.iter_mut().take(31).zip(name.bytes()) {
        *to = from;
    }
    for (i, chunk) in bytes.as_chunks::<4>().0.iter().enumerate() {
        platform::set(key + i as i32, u32::from_le_bytes(*chunk) as f64);
    }
}
pub fn last_name() -> String {
    text(9000)
}
pub fn read(page: usize) -> Vec<Entry> {
    let base = 10000 + page as i32 * 200;
    (0..10)
        .filter_map(|rank| {
            let key = base + rank * 12;
            (platform::get(key + 10) > 0.).then(|| Entry {
                name: text(key + 1),
                score: platform::get(key) as i32,
            })
        })
        .collect()
}
pub fn add(mode: u8, difficulty: u8, name: &str, score: i32) -> usize {
    let page = PAGES
        .iter()
        .position(|&(m, d)| m == mode && (m == 2 || d == difficulty))
        .unwrap_or(0);
    let mut entries = read(page);
    let name = name.trim();
    let name = if name.is_empty() { "YourName" } else { name };
    save_text(9000, name);
    entries.insert(
        0,
        Entry {
            name: name.into(),
            score,
        },
    );
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.score));
    entries.truncate(10);
    let base = 10000 + page as i32 * 200;
    for (rank, entry) in entries.iter().enumerate() {
        let key = base + rank as i32 * 12;
        platform::set(key, entry.score as f64);
        save_text(key + 1, &entry.name);
        platform::set(key + 10, 1.);
    }
    page
}

pub fn clear(page: usize) {
    let base = 10000 + page as i32 * 200;
    for rank in 0..10 {
        platform::set(base + rank * 12 + 10, 0.);
    }
}
