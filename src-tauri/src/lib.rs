use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

const MAX_REQUEST_BODY_BYTES: usize = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const MAX_PATH_LEN: usize = 4096;
const ALLOWED_METHODS: &[&str] = &["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"];
const ALLOWED_AI_PORTS: &[u16] = &[
  1234, 1337, 3000, 3001, 4096, 4097, 4098, 5000, 5001, 7860, 8000, 8001, 8080, 8081, 11434, 11435,
];

#[derive(Default)]
struct AiBridgeState {
  managed_opencode: Mutex<Option<(u16, Child)>>,
}

fn is_valid_header_name_byte(b: u8) -> bool {
  b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b)
}

fn validate_method(method: &str) -> Result<String, String> {
  let upper = method.trim().to_ascii_uppercase();
  if !ALLOWED_METHODS.contains(&upper.as_str()) {
    return Err(format!("Metode HTTP tidak diizinkan: '{}'.", upper));
  }
  Ok(upper)
}

fn validate_header(key: &str, value: &str) -> Result<(), String> {
  if key.is_empty() || key.len() > 128 || !key.bytes().all(is_valid_header_name_byte) {
    return Err(format!("Nama header HTTP tidak valid: '{}'.", key));
  }
  if value.len() > 8192 || value.contains('\r') || value.contains('\n') || value.contains('\0') {
    return Err(format!("Nilai header HTTP mengandung karakter terlarang pada '{}'.", key));
  }
  Ok(())
}

fn parse_loopback_url(
  raw_url: &str,
  extra_allowed_port: Option<u16>,
) -> Result<(SocketAddr, String, String), String> {
  let trimmed = raw_url.trim();
  let without_scheme = trimmed
    .strip_prefix("http://")
    .ok_or_else(|| "Hanya mendukung protokol http:// untuk server AI lokal.".to_string())?;

  let (host_port, path_part) = match without_scheme.find('/') {
    Some(idx) => (&without_scheme[..idx], &without_scheme[idx..]),
    None => (without_scheme, "/"),
  };

  let (host, port_str) = if host_port.starts_with('[') {
    let close_idx = host_port
      .find(']')
      .ok_or_else(|| "Format host IPv6 tidak valid.".to_string())?;
    let h = &host_port[..=close_idx];
    let rest = &host_port[close_idx + 1..];
    let p = if rest.is_empty() {
      "80"
    } else if let Some(stripped) = rest.strip_prefix(':') {
      stripped
    } else {
      return Err("Format host:port IPv6 tidak valid.".to_string());
    };
    (h, p)
  } else {
    match host_port.rsplit_once(':') {
      Some((h, p)) => (h, p),
      None => (host_port, "80"),
    }
  };

  let host_lower = host.to_ascii_lowercase();
  let is_ipv6 = host_lower == "[::1]";
  if host_lower != "127.0.0.1" && host_lower != "localhost" && !is_ipv6 {
    return Err(format!(
      "Tauri Local AI Bridge hanya mengizinkan host loopback (127.0.0.1 / localhost / [::1]), bukan '{}'.",
      host
    ));
  }

  let port: u16 = port_str
    .parse()
    .map_err(|_| format!("Port tidak valid: '{}'", port_str))?;

  if port < 1024 {
    return Err(format!(
      "Port {} tidak diizinkan (hanya port >= 1024 yang diperbolehkan).",
      port
    ));
  }

  if !ALLOWED_AI_PORTS.contains(&port) && extra_allowed_port != Some(port) {
    return Err(format!(
      "Port {} tidak termasuk daftar port layanan AI lokal yang diizinkan.",
      port
    ));
  }

  let path = if path_part.is_empty() {
    "/".to_string()
  } else {
    path_part.to_string()
  };

  if !path.starts_with('/')
    || path.len() > MAX_PATH_LEN
    || path.contains('\r')
    || path.contains('\n')
    || path.contains('\0')
    || path.chars().any(|c| c.is_ascii_whitespace())
  {
    return Err("Path URL tidak valid atau mengandung karakter kontrol/spasi.".to_string());
  }

  let addr = if is_ipv6 {
    SocketAddr::from((Ipv6Addr::LOCALHOST, port))
  } else {
    SocketAddr::from((Ipv4Addr::LOCALHOST, port))
  };

  let host_header = if is_ipv6 {
    format!("[::1]:{}", port)
  } else {
    format!("127.0.0.1:{}", port)
  };

  Ok((addr, host_header, path))
}

fn is_port_listening(port: u16) -> bool {
  let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
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
        return std::fs::canonicalize(&direct).ok().or(Some(direct));
      }
      let sidecar_dir = exe_dir.join("binaries").join(bin_name);
      if sidecar_dir.is_file() {
        return std::fs::canonicalize(&sidecar_dir).ok().or(Some(sidecar_dir));
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
        return std::fs::canonicalize(&c).ok().or(Some(c));
      }
    }
  }

  if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
    let p = PathBuf::from(local_app_data).join("opencode").join(bin_name);
    if p.is_file() {
      return std::fs::canonicalize(&p).ok().or(Some(p));
    }
  }

  if let Ok(app_data) = env::var("APPDATA") {
    let npm_bin = PathBuf::from(app_data).join("npm").join("opencode.cmd");
    if npm_bin.is_file() {
      return std::fs::canonicalize(&npm_bin).ok().or(Some(npm_bin));
    }
  }

  // 3. Explicit PATH scan skipping relative/empty directories (never search CWD)
  if let Some(path_var) = env::var_os("PATH") {
    for dir in env::split_paths(&path_var) {
      if dir.as_os_str().is_empty() || !dir.is_absolute() {
        continue;
      }
      let candidate = dir.join(bin_name);
      if candidate.is_file() {
        if let Ok(canonical) = std::fs::canonicalize(&candidate) {
          return Some(canonical);
        }
      }
    }
  }

  None
}

#[tauri::command]
fn tauri_ai_ensure_opencode(
  state: tauri::State<'_, AiBridgeState>,
  port: Option<u16>,
) -> Result<Value, String> {
  let target_port = port.unwrap_or(4096);
  if target_port < 1024 {
    return Err(format!(
      "Port {} tidak diizinkan (gunakan port >= 1024).",
      target_port
    ));
  }

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

  let child = cmd.spawn().map_err(|e| {
    format!(
      "Gagal menyalakan opencode otomatis ({}): {}",
      bin_path.display(),
      e
    )
  })?;

  if let Ok(mut guard) = state.managed_opencode.lock() {
    if let Some((_, mut prev)) = guard.take() {
      let _ = prev.kill();
      let _ = prev.wait();
    }
    *guard = Some((target_port, child));
  }

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
  state: tauri::State<'_, AiBridgeState>,
  url: String,
  method: String,
  headers: HashMap<String, String>,
  body: Option<String>,
) -> Result<Value, String> {
  let managed_port = state
    .managed_opencode
    .lock()
    .ok()
    .and_then(|g| g.as_ref().map(|(p, _)| *p));

  let (addr, host_header, path) = parse_loopback_url(&url, managed_port)?;
  let upper_method = validate_method(&method)?;

  let body_bytes = body.as_deref().unwrap_or("").as_bytes();
  if body_bytes.len() > MAX_REQUEST_BODY_BYTES {
    return Err("Ukuran body permintaan HTTP melebihi batas maksimum 10 MB.".to_string());
  }

  let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(2500))
    .map_err(|e| format!("Gagal terhubung ke {}: {}", host_header, e))?;
  let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
  let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

  let mut req_head = format!(
    "{} {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n",
    upper_method, path, host_header
  );

  for (k, v) in &headers {
    if k.eq_ignore_ascii_case("host")
      || k.eq_ignore_ascii_case("connection")
      || k.eq_ignore_ascii_case("content-length")
      || k.eq_ignore_ascii_case("transfer-encoding")
    {
      continue;
    }
    validate_header(k, v)?;
    req_head.push_str(&format!("{}: {}\r\n", k, v));
  }

  if !body_bytes.is_empty() {
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
  (&mut stream)
    .take((MAX_RESPONSE_BYTES + 1) as u64)
    .read_to_end(&mut resp_buf)
    .map_err(|e| format!("Gagal membaca respons dari server AI lokal: {}", e))?;

  if resp_buf.len() > MAX_RESPONSE_BYTES {
    return Err("Respons dari server AI lokal melebihi batas maksimum 16 MB.".to_string());
  }

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
  let app = tauri::Builder::default()
    .manage(AiBridgeState::default())
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      let state = app_handle.state::<AiBridgeState>();
      if let Ok(mut guard) = state.managed_opencode.lock() {
        if let Some((_, mut child)) = guard.take() {
          let _ = child.kill();
          let _ = child.wait();
        }
      };
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_loopback_accepts_allowed_ports_and_ipv6() {
    let (addr4, host4, path4) = parse_loopback_url("http://127.0.0.1:4096/provider", None).unwrap();
    assert_eq!(addr4, SocketAddr::from((Ipv4Addr::LOCALHOST, 4096)));
    assert_eq!(host4, "127.0.0.1:4096");
    assert_eq!(path4, "/provider");

    let (addr_local, _, _) = parse_loopback_url("http://localhost:11434/v1/models", None).unwrap();
    assert_eq!(addr_local, SocketAddr::from((Ipv4Addr::LOCALHOST, 11434)));

    let (addr6, host6, path6) = parse_loopback_url("http://[::1]:1234/v1/chat/completions", None).unwrap();
    assert_eq!(addr6, SocketAddr::from((Ipv6Addr::LOCALHOST, 1234)));
    assert_eq!(host6, "[::1]:1234");
    assert_eq!(path6, "/v1/chat/completions");

    let (addr_extra, _, _) = parse_loopback_url("http://127.0.0.1:19999/health", Some(19999)).unwrap();
    assert_eq!(addr_extra.port(), 19999);
  }

  #[test]
  fn parse_loopback_rejects_ssrf_ports_hosts_and_crlf() {
    assert!(parse_loopback_url("https://127.0.0.1:4096/", None).is_err());
    assert!(parse_loopback_url("http://192.168.1.10:4096/", None).is_err());
    assert!(parse_loopback_url("http://example.com:4096/", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:80/", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:0/", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:5432/", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:6379/", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:4096/test\r\nInjected: 1", None).is_err());
    assert!(parse_loopback_url("http://127.0.0.1:4096/test HTTP/1.1", None).is_err());
  }

  #[test]
  fn validate_method_and_headers_enforces_safety() {
    assert_eq!(validate_method("post").unwrap(), "POST");
    assert_eq!(validate_method("GET").unwrap(), "GET");
    assert!(validate_method("TRACE").is_err());
    assert!(validate_method("GET /admin HTTP/1.1\r\n").is_err());

    assert!(validate_header("Content-Type", "application/json").is_ok());
    assert!(validate_header("Authorization", "Bearer sk-123").is_ok());
    assert!(validate_header("Bad Key", "val").is_err());
    assert!(validate_header("X-Bad\r\n", "val").is_err());
    assert!(validate_header("X-Test", "val\r\nEvil: 1").is_err());
    assert!(validate_header("X-Test", "val\0null").is_err());
  }
}
