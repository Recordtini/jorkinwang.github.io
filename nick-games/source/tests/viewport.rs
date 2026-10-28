use macroquad::prelude::*;
use nick_rust::viewport::View;
#[test]
fn high_dpi_viewport_matches_logical_input_in_phone_portrait_and_landscape() {
    for (width, height) in [(390., 844.), (844., 390.), (430., 932.), (1280., 720.)] {
        let v = View::fit(width, height);
        for dpi in [1., 2., 3.] {
            let (x, y, w, h) = v.physical(dpi);
            assert!(((x as f32 + w as f32 / 2.) / dpi - width / 2.).abs() < 1.);
            assert!(((y as f32 + h as f32 / 2.) / dpi - height / 2.).abs() < 1.);
            let p = vec2(v.x + v.width * 0.5, v.y + v.height * 0.5);
            assert!(v.game_position(p).distance(vec2(300., 160.)) < 0.001);
            let option = vec2(v.x + v.width * 0.5, v.y + v.height * 270. / 320.);
            assert!((v.game_position(option).y - 270.).abs() < 0.001);
        }
    }
}
