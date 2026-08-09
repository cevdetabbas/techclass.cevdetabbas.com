# TechClass

TechClass is a teacher-owned classroom schedule studio for `techclass.cevdetabbas.com`.

It includes:

- A launch landing page with sign in and sign up.
- User accounts with secure password hashing and cookie sessions.
- SQLite persistence for users, schedules, sections, themes, and assistant messages.
- A schedule editor for bell schedules and per-class section labels.
- A live classroom display preview with selectable background animations.
- A targeted setup assistant that parses pasted bell schedules and drafts schedule/theme changes.
- Docker deployment on port `2930`.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:2930
```

## WSL Docker

From Windows PowerShell:

```powershell
C:\techclass.cevdetabbas.com\start-techclass.ps1
```

Or from WSL:

```bash
cd /mnt/c/techclass.cevdetabbas.com
./start-techclass-wsl.sh
```

The script detects the current WSL `eth0` address and binds the app to:

```text
http://<WSL_IP>:2930
```

Cloudflare Tunnel can route `techclass.cevdetabbas.com` to that local service.
