use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

fn parse_loopback_url(raw_url: &str) -> Result<(u16, String), String> {
  let trimmed = raw_url.trim();
  let without_scheme = trimmed
    .strip_prefix("http://")
    .ok_or_else(|| "Hanya mendukung protokol http:// untuk server AI lokal.".to_string())?;

  let (host_port, path_part) = match without_scheme.find('/') {
    Some(idx) => (&without_scheme[..idx], &without_scheme[idx..]),
    None => (without_scheme, "/"),
  };

  let (host, port_str) = match host_port.rsplit_once(':') {
    Some((h, p)) => (h, p),
    None => (host_port, "80"),
  };

  let host_lower = host.to_lowercase();
  if host_lower != "127.0.0.1" && host_lower != "localhost" && host_lower != "[::1]" {
    return Err(format!(
      "Tauri Local AI Bridge hanya mengizinkan host loopback (127.0.0.1 / localhost), bukan '{}'.",
      host
    ));
  }

  let port: u16 = port_str
    .parse()
    .map_err(|_| format!("Port tidak valid: '{}'", port_str))?;

  let path = if path_part.is_empty() {
    "/".to_string()
  } else {
    path_part.to_string()
  };

  Ok((port, path))
}

fn is_port_listening(port: u16) -> bool {
  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  TcpStream::connect_timeout(&addr, Duration::from_millis(220)).is_ok()
}

fn decode_chunked_body(raw: &[u8]) -> Vec<u8> {
  let mut out = Vec::new();
  let mut pos = 0;
  while pos < raw.len() {
    let line_end = match raw[pos..].windows(2).position(|w| w == b"\r\n") {
      Some(rel) => pos + rel,
      None => break,
    };
    let size_str = String::from_utf8_lossy(&raw[pos..line_end]);
    let clean_hex = size_str.split(';').next().unwrap_or("").trim();
    let chunk_size = match usize::from_str_radix(clean_hex, 16) {
      Ok(s) => s,
      Err(_) => break,
    };
    pos = line_end + 2;
    if chunk_size == 0 || pos + chunk_size > raw.len() {
      break;
    }
    out.extend_from_slice(&raw[pos..pos + chunk_size]);
    pos += chunk_size + 2;
  }
  out
}

fn find_opencode_binary() -> Option<PathBuf> {
  let bin_name = if cfg!(target_os = "windows") {
    "opencode.exe"
  } else {
    "opencode"
  };

  // 1. Check bundled sidecar next to current executable
  if let Ok(exe_path) = env::current_exe() {
    if let Some(exe_dir) = exe_path.parent() {
      let direct = exe_dir.join(bin_name);
      if direct.is_file() {
        return Some(direct);
      }
      let sidecar_dir = exe_dir.join("binaries").join(bin_name);
      if sidecar_dir.is_file() {
        return Some(sidecar_dir);
      }
    }
  }

  // 2. Check common user installation directories
  if let Ok(home) = env::var("USERPROFILE").or_else(|_| env::var("HOME")) {
    let home_path = PathBuf::from(&home);
    let candidates = [
      home_path.join(".opencode").join("bin").join(bin_name),
      home_path.join(".local").join("bin").join(bin_name),
      home_path.join("scoop").join("shims").join(bin_name),
    ];
    for c in candidates {
      if c.is_file() {
        return Some(c);
      }
    }
  }

  if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
    let p = PathBuf::from(local_app_data).join("opencode").join(bin_name);
    if p.is_file() {
      return Some(p);
    }
  }

  if let Ok(app_data) = env::var("APPDATA") {
    let npm_bin = PathBuf::from(app_data).join("npm").join("opencode.cmd");
    if npm_bin.is_file() {
      return Some(npm_bin);
    }
  }

  // 3. Fallback to system PATH
  Some(PathBuf::from(bin_name))
}

#[tauri::command]
fn tauri_ai_ensure_opencode(port: Option<u16>) -> Result<Value, String> {
  let target_port = port.unwrap_or(4096);
  let url = format!("http://127.0.0.1:{}", target_port);

  if is_port_listening(target_port) {
    return Ok(json!({
      "ok": true,
      "url": url,
      "alreadyRunning": true,
      "autoStarted": false
    }));
  }

  let bin_path = find_opencode_binary()
    .ok_or_else(|| "Binary opencode tidak ditemukan di perangkat ini.".to_string())?;

  let mut cmd = Command::new(&bin_path);
  cmd
    .arg("serve")
    .arg("--port")
    .arg(target_port.to_string())
    .arg("--hostname")
    .arg("127.0.0.1")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  cmd.spawn().map_err(|e| {
    format!(
      "Gagal menyalakan opencode otomatis ({}): {}",
      bin_path.display(),
      e
    )
  })?;

  for _ in 0..20 {
    thread::sleep(Duration::from_millis(150));
    if is_port_listening(target_port) {
      return Ok(json!({
        "ok": true,
        "url": url,
        "alreadyRunning": false,
        "autoStarted": true
      }));
    }
  }

  Err(format!(
    "Proses opencode telah dijalankan tetapi belum merespons di port {} dalam 3 detik.",
    target_port
  ))
}

#[tauri::command]
fn tauri_ai_http_request(
  url: String,
  method: String,
  headers: HashMap<String, String>,
  body: Option<String>,
) -> Result<Value, String> {
  let (port, path) = parse_loopback_url(&url)?;
  let addr = SocketAddr::from(([127, 0, 0, 1], port));

  let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(2500))
    .map_err(|e| format!("Gagal terhubung ke 127.0.0.1:{}: {}", port, e))?;
  let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
  let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

  let body_bytes = body.as_deref().unwrap_or("").as_bytes();
  let upper_method = method.trim().to_uppercase();

  let mut req_head = format!(
    "{} {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n",
    upper_method, path, port
  );

  let mut has_content_len = false;
  for (k, v) in &headers {
    if k.eq_ignore_ascii_case("host") || k.eq_ignore_ascii_case("connection") {
      continue;
    }
    if k.eq_ignore_ascii_case("content-length") {
      has_content_len = true;
    }
    req_head.push_str(&format!("{}: {}\r\n", k, v));
  }

  if !body_bytes.is_empty() && !has_content_len {
    req_head.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
  }
  req_head.push_str("\r\n");

  stream
    .write_all(req_head.as_bytes())
    .map_err(|e| format!("Gagal mengirim header HTTP: {}", e))?;
  if !body_bytes.is_empty() {
    stream
      .write_all(body_bytes)
      .map_err(|e| format!("Gagal mengirim body HTTP: {}", e))?;
  }
  let _ = stream.flush();

  let mut resp_buf = Vec::new();
  stream
    .read_to_end(&mut resp_buf)
    .map_err(|e| format!("Gagal membaca respons dari server AI lokal: {}", e))?;

  let header_end = resp_buf
    .windows(4)
    .position(|w| w == b"\r\n\r\n")
    .ok_or_else(|| "Respons HTTP dari server lokal tidak valid.".to_string())?;

  let head_str = String::from_utf8_lossy(&resp_buf[..header_end]);
  let mut lines = head_str.lines();
  let status_line = lines.next().unwrap_or("HTTP/1.1 500");
  let status_code: u16 = status_line
    .split_whitespace()
    .nth(1)
    .and_then(|s| s.parse().ok())
    .unwrap_or(500);

  let is_chunked = head_str
    .to_lowercase()
    .contains("transfer-encoding: chunked");

  let raw_body = &resp_buf[header_end + 4..];
  let decoded_body = if is_chunked {
    decode_chunked_body(raw_body)
  } else {
    raw_body.to_vec()
  };

  let body_text = String::from_utf8_lossy(&decoded_body).to_string();

  Ok(json!({
    "ok": (200..300).contains(&status_code),
    "status": status_code,
    "body": body_text
  }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      tauri_ai_ensure_opencode,
      tauri_ai_http_request
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
