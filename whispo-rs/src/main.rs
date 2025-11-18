use rdev::{listen, Event, EventType};
use serde::Serialize;
use serde_json::json;

#[derive(Serialize)]
struct RdevEvent {
    event_type: String,
    name: Option<String>,
    time: std::time::SystemTime,
    data: String,
}

fn deal_event_to_json(event: Event) -> RdevEvent {
    let mut jsonify_event = RdevEvent {
        event_type: "".to_string(),
        name: event.name,
        time: event.time,
        data: "".to_string(),
    };
    match event.event_type {
        EventType::KeyPress(key) => {
            jsonify_event.event_type = "KeyPress".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::KeyRelease(key) => {
            jsonify_event.event_type = "KeyRelease".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::MouseMove { x, y } => {
            jsonify_event.event_type = "MouseMove".to_string();
            jsonify_event.data = json!({
                "x": x,
                "y": y
            })
            .to_string();
        }
        EventType::ButtonPress(key) => {
            jsonify_event.event_type = "ButtonPress".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::ButtonRelease(key) => {
            jsonify_event.event_type = "ButtonRelease".to_string();
            jsonify_event.data = json!({
                "key": format!("{:?}", key)
            })
            .to_string();
        }
        EventType::Wheel { delta_x, delta_y } => {
            jsonify_event.event_type = "Wheel".to_string();
            jsonify_event.data = json!({
                "delta_x": delta_x,
                "delta_y": delta_y
            })
            .to_string();
        }
    }

    jsonify_event
}

fn write_text(text: &str) {
    use enigo::{Enigo, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).unwrap();

    // write text
    enigo.text(text).unwrap();
}

fn simulate_copy() {
    #[cfg(target_os = "macos")]
    {
        use enigo::{Enigo, Settings, Key};
        let mut enigo = Enigo::new(&Settings::default()).unwrap();
        enigo.key(Key::Meta, enigo::Direction::Press).unwrap();
        enigo.key(Key::C, enigo::Direction::Click).unwrap();
        enigo.key(Key::Meta, enigo::Direction::Release).unwrap();
    }

    #[cfg(target_os = "windows")]
    {
        use winapi::um::winuser::{SendInput, INPUT, KEYBDINPUT, KEYEVENTF_KEYUP};
        use std::mem;

        println!("Attempting Ctrl+C simulation using Windows API...");

        const VK_CONTROL: u16 = 0x11;
        const VK_C: u16 = 0x43;

        unsafe {
            // Ctrl down
            let mut input = INPUT {
                type_: 1, // INPUT_KEYBOARD
                u: mem::zeroed(),
            };
            *input.u.ki_mut() = KEYBDINPUT {
                wVk: VK_CONTROL,
                wScan: 0,
                dwFlags: 0,
                time: 0,
                dwExtraInfo: 0,
            };
            SendInput(1, &mut input, mem::size_of::<INPUT>() as i32);

            // Small delay
            std::thread::sleep(std::time::Duration::from_millis(10));

            // C down
            input.u.ki_mut().wVk = VK_C;
            SendInput(1, &mut input, mem::size_of::<INPUT>() as i32);

            // Small delay
            std::thread::sleep(std::time::Duration::from_millis(10));

            // C up
            input.u.ki_mut().dwFlags = KEYEVENTF_KEYUP;
            SendInput(1, &mut input, mem::size_of::<INPUT>() as i32);

            // Small delay
            std::thread::sleep(std::time::Duration::from_millis(10));

            // Ctrl up
            input.u.ki_mut().wVk = VK_CONTROL;
            input.u.ki_mut().dwFlags = KEYEVENTF_KEYUP;
            SendInput(1, &mut input, mem::size_of::<INPUT>() as i32);
        }

        println!("Ctrl+C simulation completed using Windows API");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Fallback for other systems
        use enigo::{Enigo, Settings, Key};
        let mut enigo = Enigo::new(&Settings::default()).unwrap();
        enigo.key(Key::Control, enigo::Direction::Press).unwrap();
        enigo.key(Key::C, enigo::Direction::Click).unwrap();
        enigo.key(Key::Control, enigo::Direction::Release).unwrap();
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 && args[1] == "listen" {
        if let Err(error) = listen(move |event| match event.event_type {
            EventType::KeyPress(_) | EventType::KeyRelease(_) => {
                let event = deal_event_to_json(event);
                println!("{}", serde_json::to_string(&event).unwrap());
            }

            _ => {}
        }) {
            println!("!error: {:?}", error);
        }
    }

    if args.len() > 2 && args[1] == "write" {
        let text = args[2].clone();
        write_text(text.as_str());
    }

    if args.len() > 1 && args[1] == "copy" {
        simulate_copy();
    }
}
