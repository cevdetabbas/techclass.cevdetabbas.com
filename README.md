# TechClass

TechClass is a teacher-owned classroom schedule studio for `techclass.cevdetabbas.com`.

It includes:

- A launch landing page with sign in and sign up.
- User accounts with secure password hashing, Google sign-in, and cookie sessions.
- 8-hour idle sessions that stay alive while the app is actively open.
- SQLite persistence for users, schedules, sections, themes, and assistant messages.
- A schedule editor for bell schedules and per-class section labels.
- CLS-style class sections with editable names, minutes, random images, and image upload.
- A live classroom display preview with countdown rings, Real, Simulation, and Flash modes.
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

## Google Sign-In

Create a Google OAuth client as a **Web application** and add:

```text
Authorized JavaScript origin:
https://techclass.cevdetabbas.com

Authorized redirect URI:
https://techclass.cevdetabbas.com/api/auth/google/callback
```

Then put these values in `.env`:

```env
PUBLIC_BASE_URL=https://techclass.cevdetabbas.com
COOKIE_SECURE=true
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://techclass.cevdetabbas.com/api/auth/google/callback
```

If Cloudflare Access is enabled for the hostname, allow public access or add a bypass policy for TechClass and its Google callback. Otherwise Google will redirect back to Cloudflare Access instead of the app.
