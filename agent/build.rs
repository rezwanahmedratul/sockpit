fn main() {
    // Embed the Windows UAC manifest into the .exe binary on Windows targets.
    // This forces Windows to show the "Run as Administrator" elevation prompt
    // when the user double-clicks the exe, ensuring the agent always runs
    // with highest privileges (needed for binding low ports and managing services).
    #[cfg(target_os = "windows")]
    {
        let mut res = winresource::WindowsResource::new();
        res.set_manifest_file("sockpit-agent.exe.manifest");
        res.set("ProductName", "SockPit SOCKS5 Agent");
        res.set("FileDescription", "SockPit SOCKS5 Proxy Agent Service");
        res.set("LegalCopyright", "Copyright © 2026 SockPit");
        if let Err(e) = res.compile() {
            eprintln!("cargo:warning=Failed to embed Windows resource: {}", e);
        }
    }
}
