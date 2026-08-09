const app = document.querySelector("#app");

function readSidebarPreference() {
  try {
    return localStorage.getItem("techclass_sidebar") === "collapsed";
  } catch {
    return false;
  }
}

const state = {
  user: null,
  schedule: null,
  view: "schedule",
  sidebarCollapsed: readSidebarPreference(),
  authMode: null,
  authError: "",
  carousel: 0,
  selectedBlockId: null,
  simStartedAt: null,
  simStartIndex: 0,
  flashOffsetSeconds: 0,
  demoSessions: [],
  demoRunning: false,
  demoMuted: false,
  demoStartedAt: null,
  demoElapsedSeconds: 0,
  demoAnnouncedSessionId: null,
  publicDemoSessions: [],
  publicDemoTitle: "TechClass Demo",
  publicDemoRunning: false,
  publicDemoMuted: false,
  publicDemoStartedAt: null,
  publicDemoElapsedSeconds: 0,
  publicDemoAnnouncedSessionId: null,
  assistantMessages: [],
  draftPatch: null,
};

const MAX_SECTIONS = 5;
const RING_CIRCUMFERENCE = 283;
const SECTION_IMAGES = [
  "/assets/cls/login.png",
  "/assets/cls/learning.png",
  "/assets/cls/typing.png",
  "/assets/cls/nitrotype.jpg",
  "/assets/cls/logout4.png",
  "/assets/cls/abc.jpg",
  "/assets/cls/pbs.png",
];

function defaultAnnouncement(label, minutes) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("login")) {
    return "Please log in to your accounts.";
  }
  if (normalized.includes("learning")) {
    return `Learning session started. This session will take ${minutes} minutes.`;
  }
  if (normalized.includes("typing")) {
    return `Typing session started. This session will take ${minutes} minutes.`;
  }
  if (normalized.includes("logout")) {
    return "The class is over. Please log out and prepare to leave.";
  }
  return `${label} session started. This session will take ${minutes} minutes.`;
}

function announcementText(session, fallbackIndex = 0) {
  if (!session) {
    return "";
  }
  return String(session.announcement || defaultAnnouncement(session.label || `Session ${fallbackIndex + 1}`, session.minutes || 5)).trim();
}

function createDemoSession(label, minutes, imageUrl = randomSectionImage(), announcement = defaultAnnouncement(label, minutes)) {
  return {
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    minutes,
    imageUrl,
    announcement,
  };
}

function createDefaultDemoSessions() {
  return [
    createDemoSession("Login", 3, SECTION_IMAGES[0]),
    createDemoSession("Learning", 33, SECTION_IMAGES[1]),
    createDemoSession("Typing", 10, SECTION_IMAGES[2]),
    createDemoSession("Logout", 2, SECTION_IMAGES[4]),
  ];
}

function readDemoSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem("techclass_demo_sessions") || "null");
    if (!Array.isArray(parsed) || !parsed.length) {
      return null;
    }
    return parsed.slice(0, 12).map((session, index) => ({
      id: String(session.id || `demo-stored-${index}`).slice(0, 60),
      label: String(session.label || `Session ${index + 1}`).trim().slice(0, 50) || `Session ${index + 1}`,
      minutes: Math.max(1, Math.min(240, Math.round(Number(session.minutes || 5)))),
      imageUrl: String(session.imageUrl || SECTION_IMAGES[index % SECTION_IMAGES.length]),
      announcement: String(session.announcement || defaultAnnouncement(session.label || `Session ${index + 1}`, session.minutes || 5)).slice(0, 600),
    }));
  } catch {
    return null;
  }
}

function writeDemoSessions() {
  try {
    localStorage.setItem("techclass_demo_sessions", JSON.stringify(state.demoSessions));
  } catch {
    // Demo edits still work for the current page even when storage is unavailable.
  }
}

state.demoSessions = readDemoSessions() || createDefaultDemoSessions();
state.publicDemoSessions = createDefaultDemoSessions();

const navItems = [
  { view: "schedule", label: "Schedule", short: "S" },
  { view: "display", label: "Display", short: "D" },
  { view: "demo", label: "Demo", short: "M" },
  { view: "assistant", label: "Assistant", short: "A" },
];

const slides = [
  {
    key: "schedule",
    image: "/assets/showcase-schedule.png",
    title: "Build bell schedules without spreadsheet drift.",
    copy: "Create reusable blocks, color-code classes, and break each class into the sections students actually experience.",
  },
  {
    key: "ai",
    image: "/assets/showcase-assistant.png",
    title: "Paste a rough schedule. Let the copilot shape it.",
    copy: "TechClass reads time ranges, suggests sections, and drafts animation settings without becoming a general-purpose chatbot.",
  },
  {
    key: "display",
    image: "/assets/showcase-display.png",
    title: "Turn plans into a live classroom screen.",
    copy: "Your saved schedule powers a focused display with timers, current sections, next block cues, and visual themes.",
  },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function setSchedule(schedule) {
  state.schedule = schedule;
  if (!state.selectedBlockId || !schedule.blocks.some((block) => block.id === state.selectedBlockId)) {
    state.selectedBlockId = schedule.blocks[0]?.id || null;
  }
}

function activeBlock(at = new Date()) {
  const now = at;
  const current = now.getHours() * 60 + now.getMinutes();
  return state.schedule?.blocks.find((block) => {
    const [sh, sm] = block.start.split(":").map(Number);
    const [eh, em] = block.end.split(":").map(Number);
    return current >= sh * 60 + sm && current < eh * 60 + em;
  }) || state.schedule?.blocks[0];
}

function nextBlock(block) {
  const blocks = state.schedule?.blocks || [];
  const index = blocks.findIndex((item) => item.id === block?.id);
  return blocks[index + 1] || blocks[0];
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(1, eh * 60 + em - (sh * 60 + sm));
}

function timeToSeconds(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours || 0) * 3600 + (minutes || 0) * 60;
}

function formatSeconds(seconds) {
  if (seconds === null) {
    return "READY";
  }
  if (seconds <= 0) {
    return "DONE";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatAppClock(date = new Date()) {
  return {
    date: `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}.${date.getFullYear()}`,
    time: date.toLocaleTimeString("tr-TR", { hour12: false }),
  };
}

function updateAppClock() {
  const clock = formatAppClock();
  const dateDisplay = document.querySelector("#app-date-display");
  const timeDisplay = document.querySelector("#app-time-display");
  if (dateDisplay) {
    dateDisplay.textContent = clock.date;
  }
  if (timeDisplay) {
    timeDisplay.textContent = clock.time;
  }
}

function displayMode() {
  return state.schedule?.theme?.mode || "real";
}

function displayNow() {
  return new Date(Date.now() + (displayMode() === "flash" ? state.flashOffsetSeconds * 1000 : 0));
}

function randomSectionImage() {
  return SECTION_IMAGES[Math.floor(Math.random() * SECTION_IMAGES.length)];
}

function clsSegmentsForBlock(block) {
  const duration = minutesBetween(block.start, block.end);
  if (duration <= 1) {
    return [{ id: `seg-${Date.now()}-0`, label: "Login", minutes: 1, color: block.color, imageUrl: SECTION_IMAGES[0] }];
  }
  if (duration <= 6) {
    return [
      { id: `seg-${Date.now()}-0`, label: "Login", minutes: Math.max(1, Math.floor(duration / 2)), color: block.color, imageUrl: SECTION_IMAGES[0] },
      { id: `seg-${Date.now()}-1`, label: "Logout", minutes: Math.max(1, Math.ceil(duration / 2)), color: block.color, imageUrl: SECTION_IMAGES[4] },
    ];
  }
  const login = Math.min(3, Math.max(1, Math.round(duration * 0.08)));
  const logout = Math.min(2, Math.max(1, Math.round(duration * 0.06)));
  const typing = Math.min(10, Math.max(2, Math.round(duration * 0.22)));
  const learning = Math.max(1, duration - login - typing - logout);
  return [
    { id: `seg-${Date.now()}-0`, label: "Login", minutes: login, color: block.color, imageUrl: SECTION_IMAGES[0] },
    { id: `seg-${Date.now()}-1`, label: "Learning", minutes: learning, color: block.color, imageUrl: SECTION_IMAGES[1] },
    { id: `seg-${Date.now()}-2`, label: "Typing", minutes: typing, color: block.color, imageUrl: SECTION_IMAGES[2] },
    { id: `seg-${Date.now()}-3`, label: "Logout", minutes: logout, color: block.color, imageUrl: SECTION_IMAGES[4] },
  ];
}

function selectedBlock() {
  return state.schedule?.blocks.find((block) => block.id === state.selectedBlockId) || state.schedule?.blocks[0] || null;
}

function displayBlock() {
  const mode = displayMode();
  return mode === "sim" ? selectedBlock() : activeBlock(displayNow());
}

function sectionDisplayState(block) {
  const sections = (block?.segments || []).slice(0, MAX_SECTIONS);
  const mode = displayMode();
  if (!block || !sections.length) {
    return { sections: [], activeIndex: -1, blockTimer: "READY", status: "NO CLASS SELECTED" };
  }

  let elapsed = 0;
  if (mode === "sim") {
    if (!state.simStartedAt) {
      return { sections, activeIndex: -1, blockTimer: "READY", status: "SIMULATION READY - SELECT A SECTION" };
    }
    const prior = sections.slice(0, state.simStartIndex).reduce((total, section) => total + section.minutes * 60, 0);
    elapsed = prior + Math.max(0, Math.floor((Date.now() - state.simStartedAt) / 1000));
  } else {
    const now = displayNow();
    elapsed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - timeToSeconds(block.start);
  }

  const total = sections.reduce((sum, section) => sum + section.minutes * 60, 0);
  let cursor = 0;
  let activeIndex = -1;
  let remaining = null;
  sections.forEach((section, index) => {
    const duration = section.minutes * 60;
    if (elapsed >= cursor && elapsed < cursor + duration) {
      activeIndex = index;
      remaining = Math.max(0, cursor + duration - elapsed);
    }
    cursor += duration;
  });

  if (elapsed < 0) {
    return { sections, activeIndex: -1, blockTimer: "READY", status: `${mode.toUpperCase()} MODE - WAITING FOR ${block.start}` };
  }
  if (elapsed >= total) {
    return { sections, activeIndex: -1, blockTimer: "DONE", status: `${mode.toUpperCase()} MODE - CLASS COMPLETE` };
  }
  return { sections, activeIndex, blockTimer: formatSeconds(remaining), elapsed, total, status: `${mode.toUpperCase()} MODE ACTIVE` };
}

function renderLanding() {
  const slide = slides[state.carousel];
  app.innerHTML = `
    <div class="landing">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">T</div><span>TechClass</span></div>
        <nav class="nav-actions">
          <a class="btn google-nav-btn" href="/api/auth/google" aria-label="Continue with Google" title="Continue with Google">G</a>
          <button class="btn ghost" data-action="open-auth" data-mode="login">Sign in</button>
          <button class="btn primary" data-action="open-auth" data-mode="signup">Sign up</button>
        </nav>
      </header>
      <main class="hero">
        <div class="hero-layout">
          <section class="hero-copy">
            <div class="eyebrow">Classroom schedule studio</div>
            <h1>TechClass</h1>
            <p>TechClass helps teachers turn a rough bell schedule into a clean classroom dashboard: daily blocks, section labels, visual themes, and a focused assistant that understands pasted schedule text.</p>
            <div class="hero-action-stack">
              <div class="hero-cta">
                <button class="btn blue" data-action="open-auth" data-mode="signup">Create your studio</button>
                <button class="btn" data-action="open-auth" data-mode="login">I already have one</button>
              </div>
              <div class="hero-demo-row">
                <button class="btn demo-landing-btn" data-action="open-public-demo">Demo</button>
              </div>
            </div>
          </section>
          <section class="showcase hero-showcase" aria-label="TechClass preview carousel">
            <div class="browser-dots"><span></span><span></span><span></span></div>
            <div class="slide active">
              <div class="slide-art ${slide.key}">
                <img src="${escapeHtml(slide.image)}" alt="${escapeHtml(slide.title)}">
              </div>
              <div class="slide-copy">
                <h2>${escapeHtml(slide.title)}</h2>
                <p>${escapeHtml(slide.copy)}</p>
              </div>
            </div>
            <div class="dots">
              ${slides.map((item, index) => `<button class="dot ${index === state.carousel ? "active" : ""}" aria-label="${escapeHtml(item.title)}" data-action="slide" data-index="${index}"></button>`).join("")}
            </div>
          </section>
        </div>
      </main>
      ${state.authMode ? renderAuthPanel() : ""}
    </div>
  `;
}

function renderAuthPanel(error = state.authError || "") {
  const signup = state.authMode === "signup";
  return `
    <div class="auth-panel" data-action="close-auth">
      <form class="auth-card" data-auth-form="${signup ? "signup" : "login"}">
        <h2>${signup ? "Create your studio" : "Welcome back"}</h2>
        <p>${signup ? "Save schedules, sections, themes, and assistant drafts." : "Open your saved TechClass workspace."}</p>
        <a class="btn google-btn" href="/api/auth/google"><span class="google-mark">G</span>${signup ? "Sign up with Google" : "Sign in with Google"}</a>
        <div class="auth-divider"><span>or use email</span></div>
        ${signup ? `<div class="field"><label>Name</label><input name="name" autocomplete="name" required></div>` : ""}
        <div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required></div>
        <div class="field"><label>Password</label><input type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="8"></div>
        <div class="form-error">${escapeHtml(error)}</div>
        <button class="btn blue" type="submit">${signup ? "Sign up" : "Sign in"}</button>
        <button class="btn ghost" type="button" data-action="toggle-auth" data-mode="${signup ? "login" : "signup"}">${signup ? "Use an existing account" : "Create an account"}</button>
      </form>
    </div>
  `;
}

function publicDemoTotalSeconds() {
  return state.publicDemoSessions.reduce((sum, session) => sum + Math.max(1, Number(session.minutes || 1)) * 60, 0);
}

function currentPublicDemoElapsedSeconds() {
  const base = Math.max(0, Number(state.publicDemoElapsedSeconds || 0));
  if (!state.publicDemoRunning || !state.publicDemoStartedAt) {
    return base;
  }
  return base + Math.max(0, Math.floor((Date.now() - state.publicDemoStartedAt) / 1000));
}

function clampPublicDemoElapsed() {
  state.publicDemoElapsedSeconds = Math.min(currentPublicDemoElapsedSeconds(), publicDemoTotalSeconds());
  state.publicDemoStartedAt = state.publicDemoRunning ? Date.now() : null;
}

function publicDemoDisplayState() {
  const sessions = state.publicDemoSessions;
  const total = publicDemoTotalSeconds();
  const elapsed = Math.min(currentPublicDemoElapsedSeconds(), total);
  let cursor = 0;
  let activeIndex = -1;
  sessions.forEach((session, index) => {
    const duration = Math.max(1, Number(session.minutes || 1)) * 60;
    if (elapsed >= cursor && elapsed < cursor + duration) {
      activeIndex = index;
    }
    cursor += duration;
  });
  if (!state.publicDemoRunning && elapsed <= 0) {
    activeIndex = -1;
  }
  const status = elapsed >= total
    ? "DEMO COMPLETE"
    : state.publicDemoRunning
      ? "DEMO RUNNING"
      : elapsed > 0
        ? "DEMO PAUSED"
        : "DEMO READY";
  return { sessions, total, elapsed, activeIndex, overallTimer: formatSeconds(total - elapsed), status };
}

function renderLiveAnnouncement(demo) {
  const session = demo.sessions[demo.activeIndex];
  const text = announcementText(session, demo.activeIndex);
  if (!session || !text) {
    return "";
  }
  return `
    <div class="live-announcement" aria-live="polite">
      <span>Announcement</span>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function stopAnnouncementAudio() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakAnnouncement(text) {
  const message = String(text || "").trim();
  if (!message || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
    return;
  }
  stopAnnouncementAudio();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function announceActivePublicDemo(demo = publicDemoDisplayState()) {
  const session = demo.sessions[demo.activeIndex];
  if (!state.publicDemoRunning || state.publicDemoMuted || !session) {
    return;
  }
  if (state.publicDemoAnnouncedSessionId === session.id) {
    return;
  }
  state.publicDemoAnnouncedSessionId = session.id;
  speakAnnouncement(announcementText(session, demo.activeIndex));
}

function spinOffsetStyle(active) {
  return active ? ` style="--spin-offset:${((Date.now() % 4000) / 1000).toFixed(3)}s"` : "";
}

function renderPublicDemoPage() {
  const demo = publicDemoDisplayState();
  let cursor = 0;
  app.innerHTML = `
    <div class="public-demo-page">
      <header class="topbar public-demo-topbar">
        <button class="brand brand-button" data-action="public-demo-home" aria-label="Back to TechClass home"><div class="brand-mark">T</div><span>TechClass</span></button>
        <nav class="nav-actions">
          <button class="btn ghost" data-action="public-demo-home">Home</button>
          <button class="btn ghost" data-action="open-auth" data-mode="login">Sign in</button>
          <button class="btn primary" data-action="open-auth" data-mode="signup">Sign up</button>
        </nav>
      </header>
      <main class="public-demo-main">
        <section class="panel preview cls-display public-demo-display aurora mode-sim">
          <div class="display-head demo-head public-demo-head">
            <div>
              <div class="eyebrow">Live demo</div>
              <h1><input class="public-demo-title-input" value="${escapeHtml(state.publicDemoTitle)}" data-public-demo-title aria-label="Demo title"></h1>
              <p>${escapeHtml(demo.status)} - ${demo.sessions.length} sessions</p>
              ${renderLiveAnnouncement(demo)}
            </div>
            <div class="demo-toolbar">
              <div class="slot-timer">${escapeHtml(demo.overallTimer)}</div>
              <div class="demo-controls">
                <button class="demo-control ${state.publicDemoRunning ? "active" : ""}" data-action="public-demo-play" aria-label="Play demo" title="Play"><span class="play-icon"></span></button>
                <button class="demo-control" data-action="public-demo-pause" aria-label="Pause demo" title="Pause"><span class="pause-icon"></span></button>
                <button class="demo-control" data-action="public-demo-reset" aria-label="Reset demo" title="Reset"><span class="reset-icon"></span></button>
                <button class="demo-control ${state.publicDemoMuted ? "muted" : ""}" data-action="public-demo-mute" aria-pressed="${state.publicDemoMuted}" aria-label="${state.publicDemoMuted ? "Unmute announcements" : "Mute announcements"}" title="${state.publicDemoMuted ? "Unmute announcements" : "Mute announcements"}"><span class="sound-icon ${state.publicDemoMuted ? "muted" : ""}"><span></span></span></button>
              </div>
            </div>
          </div>
          <div class="public-demo-track">
            ${demo.sessions.map((session, index) => {
              const duration = Math.max(1, Number(session.minutes || 1)) * 60;
              const done = demo.elapsed >= cursor + duration;
              const active = index === demo.activeIndex && demo.elapsed < demo.total;
              const progress = active ? Math.max(0, Math.min(1, (demo.elapsed - cursor) / duration)) : done ? 1 : 0;
              const ringOffset = Math.round(RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE);
              const timer = active ? formatSeconds(cursor + duration - demo.elapsed) : done ? "DONE" : `${String(session.minutes).padStart(2, "0")}:00`;
              cursor += duration;
              return renderPublicDemoSessionCard(session, index, { active, done, timer, ringOffset, spinning: active && state.publicDemoRunning });
            }).join("")}
            <button class="public-demo-add-tile" data-action="public-demo-add-session" aria-label="Add session" title="Add session">+</button>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderPublicDemoSessionCard(session, index, display) {
  const canDelete = state.publicDemoSessions.length > 1;
  return `
    <div class="session-card demo-session-card public-demo-session-card ${display.active ? "active" : ""} ${display.done ? "done" : ""}" data-public-demo-session-id="${escapeHtml(session.id)}">
      <button class="demo-delete" data-action="public-demo-delete-session" aria-label="Delete session" title="Delete session" ${canDelete ? "" : "disabled"}>x</button>
      <div class="demo-meta-wrap">
        <div class="session-info">
          Session ${index + 1} -
          <input class="demo-minutes-input" type="number" min="1" max="240" value="${escapeHtml(session.minutes)}" data-public-demo-field="minutes" aria-label="Session minutes">
          Min
        </div>
        <div class="announcement-popover">
          <label>Announcement</label>
          <textarea data-public-demo-field="announcement" aria-label="Session announcement">${escapeHtml(session.announcement || "")}</textarea>
        </div>
      </div>
      <input class="s-title demo-name-input" value="${escapeHtml(session.label)}" data-public-demo-field="label" aria-label="Session name">
      <label class="demo-image-upload" aria-label="Upload session image" title="Upload image">
        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" data-public-demo-image-upload>
        <div class="circle-wrap">
          <svg class="ring-svg" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="publicDemoRingGrad${index}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff9500"/><stop offset="50%" stop-color="#007aff"/><stop offset="100%" stop-color="#34c759"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="ring-bar" style="stroke-dashoffset:${display.ringOffset}" cx="50" cy="50" r="45"></circle>
          </svg>
          <div class="coin ${display.spinning ? "spinning" : ""}"${spinOffsetStyle(display.spinning)}>
            <div class="face front"><img src="${escapeHtml(session.imageUrl || randomSectionImage())}" alt=""></div>
            <div class="face back"><img src="${escapeHtml(session.imageUrl || randomSectionImage())}" alt=""></div>
          </div>
        </div>
      </label>
      <div class="time-left">${escapeHtml(display.timer)}</div>
    </div>
  `;
}

function renderApp() {
  const schedule = state.schedule;
  const block = displayBlock();
  const next = nextBlock(block);
  const collapsed = state.sidebarCollapsed;
  const clock = formatAppClock();
  app.innerHTML = `
    <div class="app-shell ${collapsed ? "sidebar-collapsed" : ""}">
      <aside class="sidebar ${collapsed ? "collapsed" : ""}">
        <button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="${collapsed ? "Expand sidebar" : "Collapse sidebar"}" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">${collapsed ? "&gt;" : "&lt;"}</button>
        <div class="brand"><div class="brand-mark">T</div><span>TechClass</span></div>
        <nav class="side-nav">
          ${navItems.map((item) => `<button class="${state.view === item.view ? "active" : ""}" data-action="view" data-view="${item.view}" aria-label="${item.label}" title="${item.label}"><span class="nav-full">${item.label}</span><span class="nav-short">${item.short}</span></button>`).join("")}
        </nav>
      </aside>
      <main class="main-area">
        <header class="app-head">
          <div class="head-metric">
            <span class="head-label">Date:</span>
            <span class="head-val" id="app-date-display">${escapeHtml(clock.date)}</span>
          </div>
          <div class="app-title-block">
            <h1>${escapeHtml(schedule.title)}</h1>
            <p>${escapeHtml(state.user.name)} - ${escapeHtml(state.user.email)}</p>
          </div>
          <div class="head-side right">
            <div class="head-metric align-right">
              <span class="head-label">Time:</span>
              <span class="head-val" id="app-time-display">${escapeHtml(clock.time)}</span>
            </div>
            <div class="nav-actions">
              <button class="btn" data-action="save">Save</button>
              <button class="btn danger" data-action="logout">Sign out</button>
            </div>
          </div>
        </header>
        ${state.view === "schedule" ? renderScheduleView() : ""}
        ${state.view === "display" ? renderDisplayView(block, next) : ""}
        ${state.view === "demo" ? renderDemoView() : ""}
        ${state.view === "assistant" ? renderAssistantView() : ""}
      </main>
    </div>
  `;
  updateAppClock();
}

function renderScheduleView() {
  const schedule = state.schedule;
  const selected = schedule.blocks.find((block) => block.id === state.selectedBlockId) || schedule.blocks[0];
  return `
    <div class="schedule-stage">
      <div class="grid">
        <section class="panel">
          <h2>Bell schedule</h2>
          <div class="field">
            <label>Studio title</label>
            <input value="${escapeHtml(schedule.title)}" data-bind="title">
          </div>
          <div class="schedule-list">
            ${schedule.blocks.map((block) => renderBlockRow(block)).join("")}
          </div>
          <button class="btn small" data-action="add-block">Add block</button>
        </section>
        <section class="panel">
          <h2>Sections and theme</h2>
          ${selected ? renderSectionEditor(selected) : ""}
          <div class="field">
            <label>Background animation</label>
            <div class="theme-grid">
              ${["aurora", "matrix", "sunrise", "chalk", "orbit"].map((theme) => `<button class="theme-btn ${theme} ${schedule.theme.background === theme ? "active" : ""}" data-action="theme" data-theme="${theme}">${theme}</button>`).join("")}
            </div>
          </div>
          ${renderDisplayView(selected || activeBlock(), nextBlock(selected || activeBlock()), true)}
        </section>
      </div>
      ${renderAssistantNudge()}
    </div>
  `;
}

function renderAssistantNudge() {
  return `
    <button class="assistant-nudge" data-action="view" data-view="assistant" aria-label="AI assistant: Paste your schedule and lesson template to automatically arrange your schedule" title="AI assistant">
      <span class="assistant-nudge-label">AI assistant</span>
      <span class="assistant-bubble">Paste your schedule and lesson template to automatically arrange your schedule</span>
      <img class="assistant-penguin" src="/assets/penguin.svg" alt="">
    </button>
  `;
}

function renderBlockRow(block) {
  return `
    <div class="schedule-row ${block.id === state.selectedBlockId ? "selected" : ""}" data-block-id="${escapeHtml(block.id)}">
      <input type="time" value="${escapeHtml(block.start)}" data-block-field="start">
      <input type="time" value="${escapeHtml(block.end)}" data-block-field="end">
      <input value="${escapeHtml(block.label)}" data-block-field="label">
      <input type="color" value="${escapeHtml(block.color)}" data-block-field="color">
      <button class="icon-btn" title="Delete block" data-action="delete-block">x</button>
    </div>
  `;
}

function renderSectionEditor(block) {
  const canAddSection = block.segments.length < MAX_SECTIONS;
  return `
    <div class="field">
      <label>Selected class</label>
      <select data-action="select-block">
        ${state.schedule.blocks.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === block.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </div>
    <div class="section-toolbar">
      <button class="btn small" data-action="apply-cls-template" data-block-id="${escapeHtml(block.id)}">Use CLS 4-section template</button>
      <span class="muted">${block.segments.length}/${MAX_SECTIONS} sections</span>
    </div>
    <div class="section-list">
      ${block.segments.slice(0, MAX_SECTIONS).map((segment) => `
        <div class="section-row" data-block-id="${escapeHtml(block.id)}" data-segment-id="${escapeHtml(segment.id)}">
          <img class="section-thumb" src="${escapeHtml(segment.imageUrl || randomSectionImage())}" alt="">
          <input value="${escapeHtml(segment.label)}" aria-label="Section name" data-segment-field="label">
          <input type="number" min="1" max="240" value="${escapeHtml(segment.minutes)}" aria-label="Section minutes" data-segment-field="minutes">
          <button class="btn small" type="button" data-action="random-section-image">Random</button>
          <label class="btn small upload-btn">
            Upload
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-segment-upload>
          </label>
          <button class="icon-btn" title="Delete section" data-action="delete-section" ${block.segments.length <= 1 ? "disabled" : ""}>x</button>
        </div>
      `).join("")}
    </div>
    <button class="btn small" data-action="add-section" data-block-id="${escapeHtml(block.id)}" ${canAddSection ? "" : "disabled"}>Add section</button>
  `;
}

function renderDisplayView(block, next, compact = false) {
  const theme = state.schedule.theme.background;
  const mode = displayMode();
  const display = sectionDisplayState(block);
  let cursor = 0;
  return `
    <section class="panel preview cls-display ${escapeHtml(theme)} mode-${escapeHtml(mode)} ${compact ? "compact" : ""}">
      <div class="display-head">
        <div>
          <div class="eyebrow">${escapeHtml(block?.start || "--:--")} - ${escapeHtml(block?.end || "--:--")}</div>
          <h2>${escapeHtml(block?.label || "No block")}</h2>
          <p>${escapeHtml(display.status)}${next ? ` - next class: ${escapeHtml(next.label)}` : ""}</p>
        </div>
        <div class="slot-timer">${escapeHtml(display.blockTimer)}</div>
      </div>
      ${compact ? "" : renderModeTools(display.sections)}
      <div class="session-grid count-${Math.max(1, display.sections.length)}">
        ${display.sections.map((segment, index) => {
          const duration = Math.max(1, Number(segment.minutes || 1) * 60);
          const elapsed = Number.isFinite(display.elapsed) ? display.elapsed : null;
          const done = elapsed !== null && elapsed >= cursor + duration;
          const active = index === display.activeIndex;
          const progress = active && elapsed !== null ? Math.max(0, Math.min(1, (elapsed - cursor) / duration)) : done ? 1 : 0;
          const ringOffset = Math.round(RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE);
          const timer = active && elapsed !== null ? formatSeconds(cursor + duration - elapsed) : done ? "DONE" : `${String(segment.minutes).padStart(2, "0")}:00`;
          cursor += duration;
          return renderSessionCard(segment, index, { active, done, timer, ringOffset });
        }).join("")}
      </div>
    </section>
  `;
}

function renderModeTools(sections) {
  const mode = displayMode();
  return `
    <div class="display-tools">
      <div class="mode-switch inline">
        ${["real", "sim", "flash"].map((item) => `<button class="sw-btn ${mode === item ? "active" : ""}" data-action="display-mode" data-mode="${item}">${item}</button>`).join("")}
      </div>
      ${mode === "sim" ? `
        <div class="mode-tools">
          <span class="tool-label">Jump:</span>
          ${sections.map((section, index) => `<button class="tool-btn" data-action="sim-jump" data-index="${index}">${escapeHtml(section.label)}</button>`).join("")}
        </div>
      ` : ""}
      ${mode === "flash" ? `
        <div class="mode-tools">
          <span class="tool-label">Time travel:</span>
          ${[
            [-3600, "-1h"],
            [-300, "-5m"],
            [-10, "-10s"],
            [10, "+10s"],
            [300, "+5m"],
            [3600, "+1h"],
            [0, "Now"],
          ].map(([seconds, label]) => `<button class="tool-btn" data-action="${seconds === 0 ? "flash-reset" : "flash-adjust"}" data-seconds="${seconds}">${label}</button>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderSessionCard(segment, index, display) {
  return `
    <div class="session-card ${display.active ? "active" : ""} ${display.done ? "done" : ""}">
      <div class="session-info">Session ${index + 1} - ${escapeHtml(segment.minutes)} Min</div>
      <div class="s-title">${escapeHtml(segment.label)}</div>
      <div class="circle-wrap">
        <svg class="ring-svg" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="ringGrad${index}" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#ff3b30"/><stop offset="50%" stop-color="#007aff"/><stop offset="100%" stop-color="#34c759"/>
            </linearGradient>
          </defs>
          <circle class="ring-bg" cx="50" cy="50" r="45"></circle>
          <circle class="ring-bar" style="stroke-dashoffset:${display.ringOffset}" cx="50" cy="50" r="45"></circle>
        </svg>
        <div class="coin ${display.active ? "spinning" : ""}"${spinOffsetStyle(display.active)}>
          <div class="face front"><img src="${escapeHtml(segment.imageUrl || randomSectionImage())}" alt=""></div>
          <div class="face back"><img src="${escapeHtml(segment.imageUrl || randomSectionImage())}" alt=""></div>
        </div>
      </div>
      <div class="time-left">${escapeHtml(display.timer)}</div>
    </div>
  `;
}

function demoTotalSeconds() {
  return state.demoSessions.reduce((sum, session) => sum + Math.max(1, Number(session.minutes || 1)) * 60, 0);
}

function currentDemoElapsedSeconds() {
  const base = Math.max(0, Number(state.demoElapsedSeconds || 0));
  if (!state.demoRunning || !state.demoStartedAt) {
    return base;
  }
  return base + Math.max(0, Math.floor((Date.now() - state.demoStartedAt) / 1000));
}

function clampDemoElapsed() {
  state.demoElapsedSeconds = Math.min(currentDemoElapsedSeconds(), demoTotalSeconds());
  state.demoStartedAt = state.demoRunning ? Date.now() : null;
}

function demoDisplayState() {
  const sessions = state.demoSessions;
  const total = demoTotalSeconds();
  const elapsed = Math.min(currentDemoElapsedSeconds(), total);
  let cursor = 0;
  let activeIndex = -1;
  sessions.forEach((session, index) => {
    const duration = Math.max(1, Number(session.minutes || 1)) * 60;
    if (elapsed >= cursor && elapsed < cursor + duration) {
      activeIndex = index;
    }
    cursor += duration;
  });
  if (!state.demoRunning && elapsed <= 0) {
    activeIndex = -1;
  }
  const status = elapsed >= total
    ? "DEMO COMPLETE"
    : state.demoRunning
      ? "DEMO RUNNING"
      : elapsed > 0
        ? "DEMO PAUSED"
        : "DEMO READY";
  return { sessions, total, elapsed, activeIndex, overallTimer: formatSeconds(total - elapsed), status };
}

function announceActiveDemo(demo = demoDisplayState()) {
  const session = demo.sessions[demo.activeIndex];
  if (!state.demoRunning || state.demoMuted || !session) {
    return;
  }
  if (state.demoAnnouncedSessionId === session.id) {
    return;
  }
  state.demoAnnouncedSessionId = session.id;
  speakAnnouncement(announcementText(session, demo.activeIndex));
}

function renderDemoView() {
  const theme = state.schedule.theme.background;
  const demo = demoDisplayState();
  let cursor = 0;
  return `
    <section class="panel preview cls-display demo-display ${escapeHtml(theme)} mode-sim">
      <div class="display-head demo-head">
        <div>
          <div class="eyebrow">Demo draft</div>
          <h2>Four-session flow</h2>
          <p>${escapeHtml(demo.status)} - ${demo.sessions.length} sessions</p>
          ${renderLiveAnnouncement(demo)}
        </div>
        <div class="demo-toolbar">
          <div class="slot-timer">${escapeHtml(demo.overallTimer)}</div>
          <div class="demo-controls">
            <button class="demo-control ${state.demoRunning ? "active" : ""}" data-action="demo-play" aria-label="Play demo" title="Play"><span class="play-icon"></span></button>
            <button class="demo-control" data-action="demo-stop" aria-label="Stop demo" title="Stop"><span class="stop-icon"></span></button>
            <button class="demo-control ${state.demoMuted ? "muted" : ""}" data-action="demo-mute" aria-pressed="${state.demoMuted}" aria-label="${state.demoMuted ? "Unmute announcements" : "Mute announcements"}" title="${state.demoMuted ? "Unmute announcements" : "Mute announcements"}"><span class="sound-icon ${state.demoMuted ? "muted" : ""}"><span></span></span></button>
            <button class="demo-add" data-action="demo-add-session" aria-label="Add session" title="Add session">+</button>
          </div>
        </div>
      </div>
      <div class="session-grid demo-session-grid count-${Math.max(1, demo.sessions.length)}">
        ${demo.sessions.map((session, index) => {
          const duration = Math.max(1, Number(session.minutes || 1)) * 60;
          const done = demo.elapsed >= cursor + duration;
          const active = index === demo.activeIndex && demo.elapsed < demo.total;
          const progress = active ? Math.max(0, Math.min(1, (demo.elapsed - cursor) / duration)) : done ? 1 : 0;
          const ringOffset = Math.round(RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE);
          const timer = active ? formatSeconds(cursor + duration - demo.elapsed) : done ? "DONE" : `${String(session.minutes).padStart(2, "0")}:00`;
          cursor += duration;
          return renderDemoSessionCard(session, index, { active, done, timer, ringOffset, spinning: active && state.demoRunning });
        }).join("")}
      </div>
    </section>
  `;
}

function renderDemoSessionCard(session, index, display) {
  const canDelete = state.demoSessions.length > 1;
  return `
    <div class="session-card demo-session-card ${display.active ? "active" : ""} ${display.done ? "done" : ""}" data-demo-session-id="${escapeHtml(session.id)}">
      <button class="demo-delete" data-action="demo-delete-session" aria-label="Delete session" title="Delete session" ${canDelete ? "" : "disabled"}>x</button>
      <div class="demo-meta-wrap">
        <div class="session-info">
          Session ${index + 1} -
          <input class="demo-minutes-input" type="number" min="1" max="240" value="${escapeHtml(session.minutes)}" data-demo-field="minutes" aria-label="Session minutes">
          Min
        </div>
        <div class="announcement-popover">
          <label>Announcement</label>
          <textarea data-demo-field="announcement" aria-label="Session announcement">${escapeHtml(session.announcement || "")}</textarea>
        </div>
      </div>
      <input class="s-title demo-name-input" value="${escapeHtml(session.label)}" data-demo-field="label" aria-label="Session name">
      <label class="demo-image-upload" aria-label="Upload session image" title="Upload image">
        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" data-demo-image-upload>
        <div class="circle-wrap">
          <svg class="ring-svg" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="demoRingGrad${index}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff9500"/><stop offset="50%" stop-color="#007aff"/><stop offset="100%" stop-color="#34c759"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="ring-bar" style="stroke-dashoffset:${display.ringOffset}" cx="50" cy="50" r="45"></circle>
          </svg>
          <div class="coin ${display.spinning ? "spinning" : ""}"${spinOffsetStyle(display.spinning)}>
            <div class="face front"><img src="${escapeHtml(session.imageUrl || randomSectionImage())}" alt=""></div>
            <div class="face back"><img src="${escapeHtml(session.imageUrl || randomSectionImage())}" alt=""></div>
          </div>
        </div>
      </label>
      <div class="time-left">${escapeHtml(display.timer)}</div>
    </div>
  `;
}

function renderAssistantView() {
  return `
    <div class="grid">
      <section class="panel">
        <h2>Targeted setup assistant</h2>
        <div class="chat-log">
          ${state.assistantMessages.map((message) => `<div class="message ${escapeHtml(message.role)}">${escapeHtml(message.content)}</div>`).join("")}
          ${!state.assistantMessages.length ? `<div class="message assistant">Paste a bell schedule or ask me to split each class into classroom sections.</div>` : ""}
        </div>
        <form data-assistant-form>
          <div class="field">
            <label>Paste schedule or instruction</label>
            <textarea name="message" placeholder="8:00-8:15 Arrival&#10;8:15-9:00 Digital Lab&#10;Split every class into mini lesson, practice, and exit ticket"></textarea>
          </div>
          <button class="btn blue" type="submit">Draft changes</button>
        </form>
      </section>
      <section class="panel">
        <h2>Draft</h2>
        ${state.draftPatch ? `
          <div class="draft-panel">
            <p>${escapeHtml(state.draftPatch.reply)}</p>
            <button class="btn blue" data-action="apply-draft">Apply draft</button>
            <button class="btn" data-action="clear-draft">Clear</button>
          </div>
          ${renderDraftSummary(state.draftPatch.patch?.schedule)}
        ` : `<p class="muted">Assistant drafts will appear here before they change your saved schedule.</p>`}
      </section>
    </div>
  `;
}

function renderDraftSummary(schedule) {
  if (!schedule) {
    return "";
  }
  return `
    <div class="section-list">
      ${schedule.blocks.slice(0, 8).map((block) => `<div class="message assistant"><strong>${escapeHtml(block.start)}-${escapeHtml(block.end)}</strong> ${escapeHtml(block.label)}</div>`).join("")}
    </div>
  `;
}

async function saveSchedule() {
  const payload = await api("/api/schedule", { method: "PUT", body: { schedule: state.schedule } });
  setSchedule(payload.schedule);
  renderApp();
}

async function heartbeat() {
  if (!state.user) {
    return;
  }
  try {
    await api("/api/session/heartbeat", { method: "POST" });
  } catch {
    state.user = null;
    state.schedule = null;
    state.view = "schedule";
    renderLanding();
  }
}

function updateBlock(blockId, field, value) {
  state.schedule.blocks = state.schedule.blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }
    return { ...block, [field]: value };
  });
}

function updateSegment(blockId, segmentId, field, value) {
  state.schedule.blocks = state.schedule.blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }
    return {
      ...block,
      segments: block.segments.map((segment) => segment.id === segmentId ? { ...segment, [field]: field === "minutes" ? Number(value) : value } : segment),
    };
  });
}

function updateDemoSession(sessionId, field, value) {
  let changed = false;
  state.demoSessions = state.demoSessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    if (field === "minutes") {
      const minutes = Math.max(1, Math.min(240, Math.round(Number(value || 0))));
      if (!Number.isFinite(minutes)) {
        return session;
      }
      changed = true;
      return { ...session, minutes };
    }
    if (field === "announcement") {
      changed = true;
      if (state.demoAnnouncedSessionId === sessionId) {
        state.demoAnnouncedSessionId = null;
      }
      return { ...session, announcement: String(value || "").slice(0, 600) };
    }
    if (field === "imageUrl") {
      changed = true;
      return { ...session, imageUrl: String(value || "") };
    }
    changed = true;
    return { ...session, label: String(value || "").slice(0, 50) };
  });
  if (changed) {
    clampDemoElapsed();
    writeDemoSessions();
  }
}

function demoSessionById(sessionId) {
  return state.demoSessions.find((session) => session.id === sessionId) || null;
}

function updatePublicDemoSession(sessionId, field, value) {
  state.publicDemoSessions = state.publicDemoSessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    if (field === "minutes") {
      const minutes = Math.max(1, Math.min(240, Math.round(Number(value || 0))));
      return Number.isFinite(minutes) ? { ...session, minutes } : session;
    }
    if (field === "announcement") {
      if (state.publicDemoAnnouncedSessionId === sessionId) {
        state.publicDemoAnnouncedSessionId = null;
      }
      return { ...session, announcement: String(value || "").slice(0, 600) };
    }
    if (field === "imageUrl") {
      return { ...session, imageUrl: String(value || "") };
    }
    return { ...session, label: String(value || "").slice(0, 50) };
  });
  clampPublicDemoElapsed();
}

function publicDemoSessionById(sessionId) {
  return state.publicDemoSessions.find((session) => session.id === sessionId) || null;
}

function readDemoImageFile(file, onLoad) {
  if (!file) {
    return false;
  }
  const supportedType = /^image\/(png|jpe?g|webp|gif)$/i.test(file.type || "");
  const supportedName = /\.(png|jpe?g|webp|gif)$/i.test(file.name || "");
  if (!supportedType && !supportedName) {
    alert("Please choose a JPG, JPEG, PNG, WEBP, or GIF image.");
    return false;
  }
  if (file.size > 1500 * 1024) {
    alert("Please choose an image under 1.5 MB.");
    return false;
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result || ""));
  reader.readAsDataURL(file);
  return true;
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  if (authError) {
    state.authMode = "login";
    state.authError = authError;
    window.history.replaceState({}, "", window.location.pathname);
  }
  if (window.location.pathname === "/demo" && !authError) {
    renderPublicDemoPage();
    return;
  }

  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    setSchedule(payload.schedule);
    const messages = await api("/api/assistant/messages");
    state.assistantMessages = messages.messages || [];
    renderApp();
  } catch {
    if (window.location.pathname === "/demo") {
      renderPublicDemoPage();
    } else {
      renderLanding();
    }
  }
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "open-auth") {
    if (!state.user && window.location.pathname === "/demo") {
      window.history.pushState({}, "", "/");
    }
    state.authMode = button.dataset.mode;
    state.authError = "";
    renderLanding();
  }
  if (action === "toggle-auth") {
    state.authMode = button.dataset.mode;
    state.authError = "";
    renderLanding();
  }
  if (action === "close-auth" && event.target.classList.contains("auth-panel")) {
    state.authMode = null;
    state.authError = "";
    renderLanding();
  }
  if (action === "slide") {
    state.carousel = Number(button.dataset.index);
    renderLanding();
  }
  if (action === "open-public-demo") {
    state.authMode = null;
    state.authError = "";
    window.history.pushState({}, "", "/demo");
    renderPublicDemoPage();
  }
  if (action === "public-demo-home") {
    state.publicDemoRunning = false;
    state.publicDemoStartedAt = null;
    state.publicDemoAnnouncedSessionId = null;
    stopAnnouncementAudio();
    window.history.pushState({}, "", "/");
    renderLanding();
  }
  if (action === "public-demo-play") {
    const total = publicDemoTotalSeconds();
    const elapsed = currentPublicDemoElapsedSeconds();
    if (elapsed >= total) {
      state.publicDemoAnnouncedSessionId = null;
    }
    state.publicDemoElapsedSeconds = elapsed >= total ? 0 : elapsed;
    state.publicDemoStartedAt = Date.now();
    state.publicDemoRunning = true;
    renderPublicDemoPage();
    announceActivePublicDemo();
  }
  if (action === "public-demo-pause") {
    state.publicDemoElapsedSeconds = currentPublicDemoElapsedSeconds();
    state.publicDemoStartedAt = null;
    state.publicDemoRunning = false;
    stopAnnouncementAudio();
    renderPublicDemoPage();
  }
  if (action === "public-demo-reset") {
    state.publicDemoElapsedSeconds = 0;
    state.publicDemoStartedAt = null;
    state.publicDemoRunning = false;
    state.publicDemoAnnouncedSessionId = null;
    stopAnnouncementAudio();
    renderPublicDemoPage();
  }
  if (action === "public-demo-mute") {
    state.publicDemoMuted = !state.publicDemoMuted;
    if (state.publicDemoMuted) {
      stopAnnouncementAudio();
    } else {
      state.publicDemoAnnouncedSessionId = null;
    }
    renderPublicDemoPage();
    announceActivePublicDemo();
  }
  if (action === "public-demo-add-session") {
    clampPublicDemoElapsed();
    const index = state.publicDemoSessions.length;
    state.publicDemoSessions.push(createDemoSession(`Session ${index + 1}`, 5, SECTION_IMAGES[index % SECTION_IMAGES.length]));
    state.publicDemoAnnouncedSessionId = null;
    renderPublicDemoPage();
  }
  if (action === "public-demo-delete-session") {
    const card = button.closest("[data-public-demo-session-id]");
    if (card && state.publicDemoSessions.length > 1) {
      clampPublicDemoElapsed();
      state.publicDemoSessions = state.publicDemoSessions.filter((session) => session.id !== card.dataset.publicDemoSessionId);
      clampPublicDemoElapsed();
      state.publicDemoAnnouncedSessionId = null;
      renderPublicDemoPage();
    }
  }
  if (action === "toggle-sidebar") {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    try {
      localStorage.setItem("techclass_sidebar", state.sidebarCollapsed ? "collapsed" : "expanded");
    } catch {
      // Ignore storage failures in private or locked-down browsing contexts.
    }
    renderApp();
  }
  if (action === "view") {
    state.view = button.dataset.view;
    renderApp();
  }
  if (action === "demo-play") {
    const total = demoTotalSeconds();
    const elapsed = currentDemoElapsedSeconds();
    if (elapsed >= total) {
      state.demoAnnouncedSessionId = null;
    }
    state.demoElapsedSeconds = elapsed >= total ? 0 : elapsed;
    state.demoStartedAt = Date.now();
    state.demoRunning = true;
    renderApp();
    announceActiveDemo();
  }
  if (action === "demo-stop") {
    state.demoElapsedSeconds = currentDemoElapsedSeconds();
    state.demoStartedAt = null;
    state.demoRunning = false;
    stopAnnouncementAudio();
    renderApp();
  }
  if (action === "demo-mute") {
    state.demoMuted = !state.demoMuted;
    if (state.demoMuted) {
      stopAnnouncementAudio();
    } else {
      state.demoAnnouncedSessionId = null;
    }
    renderApp();
    announceActiveDemo();
  }
  if (action === "demo-add-session") {
    clampDemoElapsed();
    const index = state.demoSessions.length;
    state.demoSessions.push(createDemoSession(`Session ${index + 1}`, 5, SECTION_IMAGES[index % SECTION_IMAGES.length]));
    state.demoAnnouncedSessionId = null;
    writeDemoSessions();
    renderApp();
  }
  if (action === "demo-delete-session") {
    const card = button.closest("[data-demo-session-id]");
    if (card && state.demoSessions.length > 1) {
      clampDemoElapsed();
      state.demoSessions = state.demoSessions.filter((session) => session.id !== card.dataset.demoSessionId);
      clampDemoElapsed();
      state.demoAnnouncedSessionId = null;
      writeDemoSessions();
      renderApp();
    }
  }
  if (action === "logout") {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    state.schedule = null;
    renderLanding();
  }
  if (action === "save") {
    await saveSchedule();
  }
  if (action === "add-block") {
    const id = `block-${Date.now()}`;
    state.schedule.blocks.push({
      id,
      label: "New class",
      start: "11:00",
      end: "11:30",
      kind: "class",
      color: "#2563eb",
      segments: clsSegmentsForBlock({ start: "11:00", end: "11:30", color: "#2563eb" }),
    });
    state.selectedBlockId = id;
    renderApp();
  }
  if (action === "delete-block") {
    const row = button.closest("[data-block-id]");
    state.schedule.blocks = state.schedule.blocks.filter((block) => block.id !== row.dataset.blockId);
    state.selectedBlockId = state.schedule.blocks[0]?.id || null;
    renderApp();
  }
  if (action === "select-block") {
    state.selectedBlockId = button.value;
    renderApp();
  }
  if (action === "add-section") {
    const blockId = button.dataset.blockId;
    state.schedule.blocks = state.schedule.blocks.map((block) => block.id === blockId ? {
      ...block,
      segments: block.segments.length >= MAX_SECTIONS ? block.segments : [
        ...block.segments,
        { id: `seg-${Date.now()}`, label: "New section", minutes: 5, color: block.color, imageUrl: randomSectionImage() },
      ],
    } : block);
    renderApp();
  }
  if (action === "apply-cls-template") {
    const blockId = button.dataset.blockId;
    state.schedule.blocks = state.schedule.blocks.map((block) => block.id === blockId ? {
      ...block,
      segments: clsSegmentsForBlock(block),
    } : block);
    renderApp();
  }
  if (action === "random-section-image") {
    const row = button.closest("[data-segment-id]");
    updateSegment(row.dataset.blockId, row.dataset.segmentId, "imageUrl", randomSectionImage());
    renderApp();
  }
  if (action === "delete-section") {
    const row = button.closest("[data-segment-id]");
    state.schedule.blocks = state.schedule.blocks.map((block) => block.id === row.dataset.blockId ? {
      ...block,
      segments: block.segments.length <= 1 ? block.segments : block.segments.filter((segment) => segment.id !== row.dataset.segmentId),
    } : block);
    renderApp();
  }
  if (action === "theme") {
    state.schedule.theme.background = button.dataset.theme;
    renderApp();
  }
  if (action === "display-mode") {
    state.schedule.theme.mode = button.dataset.mode;
    if (button.dataset.mode !== "sim") {
      state.simStartedAt = null;
    }
    renderApp();
  }
  if (action === "sim-jump") {
    state.schedule.theme.mode = "sim";
    state.simStartIndex = Number(button.dataset.index || 0);
    state.simStartedAt = Date.now();
    renderApp();
  }
  if (action === "flash-adjust") {
    state.schedule.theme.mode = "flash";
    state.flashOffsetSeconds += Number(button.dataset.seconds || 0);
    renderApp();
  }
  if (action === "flash-reset") {
    state.schedule.theme.mode = "flash";
    state.flashOffsetSeconds = 0;
    renderApp();
  }
  if (action === "apply-draft") {
    if (state.draftPatch?.patch?.schedule) {
      setSchedule(state.draftPatch.patch.schedule);
      state.draftPatch = null;
      state.view = "schedule";
      renderApp();
    }
  }
  if (action === "clear-draft") {
    state.draftPatch = null;
    renderApp();
  }
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (input.matches("[data-bind='title']")) {
    state.schedule.title = input.value;
  }
  if (input.matches("[data-block-field]")) {
    const row = input.closest("[data-block-id]");
    updateBlock(row.dataset.blockId, input.dataset.blockField, input.value);
    if (input.dataset.blockField === "color") {
      state.schedule.theme.accent = input.value;
    }
  }
  if (input.matches("[data-segment-field]")) {
    const row = input.closest("[data-segment-id]");
    updateSegment(row.dataset.blockId, row.dataset.segmentId, input.dataset.segmentField, input.value);
  }
  if (input.matches("[data-demo-field]")) {
    const row = input.closest("[data-demo-session-id]");
    if (row) {
      updateDemoSession(row.dataset.demoSessionId, input.dataset.demoField, input.value);
    }
  }
  if (input.matches("[data-public-demo-field]")) {
    const row = input.closest("[data-public-demo-session-id]");
    if (row) {
      updatePublicDemoSession(row.dataset.publicDemoSessionId, input.dataset.publicDemoField, input.value);
    }
  }
  if (input.matches("[data-public-demo-title]")) {
    state.publicDemoTitle = input.value.slice(0, 60);
  }
});

app.addEventListener("change", (event) => {
  const input = event.target;
  if (input.matches("[data-public-demo-image-upload]")) {
    const row = input.closest("[data-public-demo-session-id]");
    const file = input.files?.[0];
    if (!row || !file) {
      return;
    }
    readDemoImageFile(file, (imageUrl) => {
      updatePublicDemoSession(row.dataset.publicDemoSessionId, "imageUrl", imageUrl);
      renderPublicDemoPage();
    });
    return;
  }
  if (input.matches("[data-demo-image-upload]")) {
    const row = input.closest("[data-demo-session-id]");
    const file = input.files?.[0];
    if (!row || !file) {
      return;
    }
    readDemoImageFile(file, (imageUrl) => {
      updateDemoSession(row.dataset.demoSessionId, "imageUrl", imageUrl);
      renderApp();
    });
    return;
  }
  if (input.matches("[data-public-demo-field]")) {
    const row = input.closest("[data-public-demo-session-id]");
    const session = row ? publicDemoSessionById(row.dataset.publicDemoSessionId) : null;
    if (session && input.dataset.publicDemoField === "minutes") {
      input.value = session.minutes;
    }
    renderPublicDemoPage();
    return;
  }
  if (input.matches("[data-demo-field]")) {
    const row = input.closest("[data-demo-session-id]");
    const session = row ? demoSessionById(row.dataset.demoSessionId) : null;
    if (session && input.dataset.demoField === "minutes") {
      input.value = session.minutes;
    }
    renderApp();
    return;
  }
  if (input.matches("select[data-action='select-block']")) {
    state.selectedBlockId = input.value;
    renderApp();
    return;
  }
  if (input.matches("[data-segment-upload]")) {
    const row = input.closest("[data-segment-id]");
    const file = input.files?.[0];
    if (!file || !row) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      input.value = "";
      return;
    }
    if (file.size > 750 * 1024) {
      alert("Please choose an image under 750 KB.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSegment(row.dataset.blockId, row.dataset.segmentId, "imageUrl", String(reader.result || ""));
      renderApp();
    };
    reader.readAsDataURL(file);
  }
});

app.addEventListener("submit", async (event) => {
  const authForm = event.target.closest("[data-auth-form]");
  const assistantForm = event.target.closest("[data-assistant-form]");
  if (authForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(authForm));
    const path = authForm.dataset.authForm === "signup" ? "/api/auth/signup" : "/api/auth/login";
    try {
      const payload = await api(path, { method: "POST", body: data });
      state.user = payload.user;
      setSchedule(payload.schedule);
      state.authMode = null;
      state.authError = "";
      renderApp();
    } catch (error) {
      const panel = authForm.querySelector(".form-error");
      panel.textContent = error.message;
    }
  }
  if (assistantForm) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(assistantForm));
    const response = await api("/api/assistant", { method: "POST", body: data });
    state.assistantMessages.push({ role: "user", content: data.message });
    state.assistantMessages.push({ role: "assistant", content: response.reply });
    state.draftPatch = response.patch ? response : null;
    renderApp();
  }
});

setInterval(() => {
  if (state.user && state.view === "display") {
    renderApp();
  }
}, 30000);

setInterval(updateAppClock, 1000);

setInterval(() => {
  if (state.user || window.location.pathname !== "/demo" || !state.publicDemoRunning) {
    return;
  }
  if (document.activeElement?.matches("[data-public-demo-field]")) {
    return;
  }
  if (document.activeElement?.matches("[data-public-demo-title]")) {
    return;
  }
  if (currentPublicDemoElapsedSeconds() >= publicDemoTotalSeconds()) {
    state.publicDemoElapsedSeconds = publicDemoTotalSeconds();
    state.publicDemoStartedAt = null;
    state.publicDemoRunning = false;
    stopAnnouncementAudio();
  }
  renderPublicDemoPage();
  announceActivePublicDemo();
}, 1000);

setInterval(() => {
  if (!state.user || state.view !== "demo" || !state.demoRunning) {
    return;
  }
  if (document.activeElement?.matches("[data-demo-field]")) {
    return;
  }
  if (currentDemoElapsedSeconds() >= demoTotalSeconds()) {
    state.demoElapsedSeconds = demoTotalSeconds();
    state.demoStartedAt = null;
    state.demoRunning = false;
    stopAnnouncementAudio();
  }
  renderApp();
  announceActiveDemo();
}, 1000);

setInterval(() => {
  if (state.user && document.visibilityState === "visible") {
    heartbeat();
  }
}, 5 * 60 * 1000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    heartbeat();
  }
});

window.addEventListener("focus", heartbeat);

window.addEventListener("popstate", () => {
  if (state.user) {
    return;
  }
  state.authMode = null;
  state.authError = "";
  if (window.location.pathname === "/demo") {
    renderPublicDemoPage();
  } else {
    state.publicDemoRunning = false;
    state.publicDemoStartedAt = null;
    renderLanding();
  }
});

bootstrap();
