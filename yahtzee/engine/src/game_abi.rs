use crate::game::Game;
use std::cell::RefCell;
thread_local!{static GAME:RefCell<Game>=RefCell::new(Game::new(1));}
#[no_mangle]pub extern "C" fn game_new(seed:u32){GAME.with(|g|*g.borrow_mut()=Game::new(seed));}
#[no_mangle]pub extern "C" fn game_new_triple(seed:u32){GAME.with(|g|*g.borrow_mut()=Game::triple(seed));}
#[no_mangle]pub extern "C" fn game_new_painted(seed:u32){GAME.with(|g|*g.borrow_mut()=Game::painted(seed));}
#[no_mangle]pub extern "C" fn game_new_pyramid(seed:u32){GAME.with(|g|*g.borrow_mut()=Game::pyramid(seed));}
#[no_mangle]pub extern "C" fn game_roll()->u32{GAME.with(|g|g.borrow_mut().roll()as u32)}
#[no_mangle]pub extern "C" fn game_step(){GAME.with(|g|g.borrow_mut().step());}
#[no_mangle]pub extern "C" fn game_step_batch(steps:u32){GAME.with(|g|g.borrow_mut().step_batch(steps.clamp(1,20)));}
/// One original-derived collision sound: type in bits 0..7, die in 8..15,
/// volume (0..127) in 16..23; zero means the queue is empty.
#[no_mangle]pub extern "C" fn game_sound()->u32{GAME.with(|g|{let mut g=g.borrow_mut();if g.simulation.sounds.is_empty(){return 0}let(t,i,v)=g.simulation.sounds.remove(0);t|(i<<8)|(v<<16)})}
#[no_mangle]pub extern "C" fn game_pickup()->u32{GAME.with(|g|g.borrow_mut().pickup()as u32)}
#[no_mangle]pub extern "C" fn game_pointer(dx:f32,dy:f32,millis:u32)->u32{GAME.with(|g|g.borrow_mut().pointer(dx,dy,millis)as u32)}
#[no_mangle]pub extern "C" fn game_cup(field:u32)->f64{GAME.with(|g|{let g=g.borrow();match field{0..=2=>((g.cup.position[field as usize]as f64*65536.)as i32)as f64/65536.,3..=11=>g.cup.orientation().0[(field as usize-3)/3][(field as usize-3)%3]as f64/65536.,12=>g.cup.picked as u32 as f64,13=>g.cup.previous_x as f64,_=>0.}})}
#[no_mangle]pub extern "C" fn game_vertex_light(index:u32,x:i32,y:i32,z:i32,ambient:u32,diffuse:u32,specular:u32)->i32{GAME.with(|g|{let g=g.borrow();let m=if index==5{g.cup.orientation()}else if let Some(d)=g.simulation.dice.get(index as usize){d.world}else{return 0};crate::lighting::vertex_scene(m,[x,y,z],[ambient,diffuse,specular],if g.simulation.pyramid_arena{2}else if g.simulation.painted_arena{1}else{0})})}
#[no_mangle]pub extern "C" fn retail_vertex_light(a:i32,b:i32,c:i32,d:i32,e:i32,f:i32,g:i32,h:i32,i:i32,x:i32,y:i32,z:i32,ambient:u32,diffuse:u32,specular:u32)->i32{crate::lighting::vertex(crate::matrix::Matrix([[a,b,c],[d,e,f],[g,h,i]]),[x,y,z],[ambient,diffuse,specular])}
#[no_mangle]pub extern "C" fn game_hold(die:u32)->u32{GAME.with(|g|g.borrow_mut().hold(die as usize)as u32)}
#[no_mangle]pub extern "C" fn game_commit(category:u32)->u32{GAME.with(|g|g.borrow_mut().commit(category)as u32)}
#[no_mangle]pub extern "C" fn game_preview(category:u32)->i32{GAME.with(|g|g.borrow().preview(category))}
#[no_mangle]pub extern "C" fn game_preview_column(category:u32,column:u32)->i32{GAME.with(|g|g.borrow().preview_column(category,column as usize))}
#[no_mangle]pub extern "C" fn game_commit_column(category:u32,column:u32)->u32{GAME.with(|g|g.borrow_mut().commit_column(category,column as usize)as u32)}
#[no_mangle]pub extern "C" fn game_cell_column(category:u32,column:u32)->i32{GAME.with(|g|{let g=g.borrow();if column==0||column as usize>g.columns{return -1}g.book.cells.get(category as usize).map_or(-1,|r|r[column as usize-1])})}
#[no_mangle]pub extern "C" fn game_cell(category:u32)->i32{GAME.with(|g|g.borrow().book.cells.get(category as usize).map_or(-1,|r|r[0]))}
#[no_mangle]pub extern "C" fn game_state(field:u32)->u32{GAME.with(|g|{let g=g.borrow();match field{0=>g.rolls,1=>g.turns,2=>g.moving as u32,3=>g.total()as u32,_=>0}})}
#[no_mangle]pub extern "C" fn game_die(index:u32,field:u32)->f64{GAME.with(|g|{
    let g=g.borrow();let Some(d)=g.simulation.dice.get(index as usize)else{return 0.};
    match field{0..=2=>d.world_position[field as usize]as f64,3..=11=>d.world.0[(field as usize-3)/3][(field as usize-3)%3]as f64/65536.,12=>g.simulation.faces()[index as usize]as f64,13=>d.held as u32 as f64,14=>d.sleeping as u32 as f64,15..=17=>d.position[field as usize-15]as f64,18..=20=>d.velocity[field as usize-18]as f64,21=>d.face as f64,_=>0.}
})}
