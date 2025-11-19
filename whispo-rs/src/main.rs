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
    use enigo::{Enigo, Keyboard, Settings, Key};

    let mut enigo = Enigo::new(&Settings::default()).unwrap();

    // Simulate Ctrl+C (Cmd+C on Mac)
    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, enigo::Direction::Press).unwrap();
        enigo.key(Key::C, enigo::Direction::Click).unwrap();
        enigo.key(Key::Meta, enigo::Direction::Release).unwrap();
    }

    #[cfg(not(target_os = "macos"))]
    {
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
