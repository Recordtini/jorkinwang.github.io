use macroquad::prelude::*;
use nick_rust::{game::Game, physics::Kind, platform};
fn window_conf() -> Conf {
    Conf {
        window_title: "Nick Games · Rust".into(),
        window_width: 1200,
        window_height: 640,
        high_dpi: true,
        sample_count: 4,
        window_resizable: true,
        ..Default::default()
    }
}
#[macroquad::main(window_conf)]
async fn main() {
    let kind = if platform::game() == 1 {
        Kind::Hover
    } else {
        Kind::Bus
    };
    clear_background(BLACK);
    draw_text("LOADING ORIGINAL GAME ASSETS…", 40., 100., 30., WHITE);
    next_frame().await;
    match Game::load(kind).await {
        Ok(mut game) => loop {
            game.update();
            game.draw();
            next_frame().await
        },
        Err(error) => loop {
            platform::debug(&serde_json::json!({"error":error}).to_string());
            clear_background(BLACK);
            draw_text("Could not load the game", 40., 70., 30., RED);
            draw_text(&error, 40., 120., 22., WHITE);
            next_frame().await
        },
    }
}
