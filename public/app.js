const app = document.querySelector("#app");

const state = {
  user: null,
  schedule: null,
  view: "schedule",
  authMode: null,
  authError: "",
  carousel: 0,
  selectedBlockId: null,
  assistantMessages: [],
  draftPatch: null,
};

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

function activeBlock() {
  const now = new Date();
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

function renderLanding() {
  const slide = slides[state.carousel];
  app.innerHTML = `
    <div class="landing">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">T</div><span>TechClass</span></div>
        <nav class="nav-actions">
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
            <div class="hero-cta">
              <button class="btn blue" data-action="open-auth" data-mode="signup">Create your studio</button>
              <button class="btn" data-action="open-auth" data-mode="login">I already have one</button>
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

function renderApp() {
  const schedule = state.schedule;
  const block = activeBlock();
  const next = nextBlock(block);
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">T</div><span>TechClass</span></div>
        <nav class="side-nav">
          ${["schedule", "display", "assistant"].map((view) => `<button class="${state.view === view ? "active" : ""}" data-action="view" data-view="${view}">${view[0].toUpperCase() + view.slice(1)}</button>`).join("")}
        </nav>
      </aside>
      <main class="main-area">
        <header class="app-head">
          <div>
            <h1>${escapeHtml(schedule.title)}</h1>
            <p>${escapeHtml(state.user.name)} - ${escapeHtml(state.user.email)}</p>
          </div>
          <div class="nav-actions">
            <button class="btn" data-action="save">Save</button>
            <button class="btn danger" data-action="logout">Sign out</button>
          </div>
        </header>
        ${state.view === "schedule" ? renderScheduleView() : ""}
        ${state.view === "display" ? renderDisplayView(block, next) : ""}
        ${state.view === "assistant" ? renderAssistantView() : ""}
      </main>
    </div>
  `;
}

function renderScheduleView() {
  const schedule = state.schedule;
  const selected = schedule.blocks.find((block) => block.id === state.selectedBlockId) || schedule.blocks[0];
  return `
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
        ${renderDisplayView(activeBlock(), nextBlock(activeBlock()), true)}
      </section>
    </div>
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
  return `
    <div class="field">
      <label>Selected class</label>
      <select data-action="select-block">
        ${state.schedule.blocks.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === block.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
      </select>
    </div>
    <div class="section-list">
      ${block.segments.map((segment) => `
        <div class="section-row" data-block-id="${escapeHtml(block.id)}" data-segment-id="${escapeHtml(segment.id)}">
          <input value="${escapeHtml(segment.label)}" data-segment-field="label">
          <input type="number" min="1" max="240" value="${escapeHtml(segment.minutes)}" data-segment-field="minutes">
          <button class="icon-btn" title="Delete section" data-action="delete-section">x</button>
        </div>
      `).join("")}
    </div>
    <button class="btn small" data-action="add-section" data-block-id="${escapeHtml(block.id)}">Add section</button>
  `;
}

function renderDisplayView(block, next, compact = false) {
  const theme = state.schedule.theme.background;
  const duration = block ? minutesBetween(block.start, block.end) : 0;
  const firstSection = block?.segments?.[0]?.label || "Ready";
  return `
    <section class="panel preview ${escapeHtml(theme)} ${compact ? "compact" : ""}">
      <div class="preview-content">
        <div>
          <div class="eyebrow">${escapeHtml(block?.start || "--:--")} - ${escapeHtml(block?.end || "--:--")}</div>
          <div class="big-timer">${duration}</div>
          <div class="current-label">${escapeHtml(block?.label || "No block")}</div>
          <div class="next-label">${escapeHtml(firstSection)} - next: ${escapeHtml(next?.label || "Done")}</div>
        </div>
      </div>
    </section>
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

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  if (authError) {
    state.authMode = "login";
    state.authError = authError;
    window.history.replaceState({}, "", window.location.pathname);
  }

  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    setSchedule(payload.schedule);
    const messages = await api("/api/assistant/messages");
    state.assistantMessages = messages.messages || [];
    renderApp();
  } catch {
    renderLanding();
  }
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "open-auth") {
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
  if (action === "view") {
    state.view = button.dataset.view;
    renderApp();
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
      segments: [{ id: `seg-${Date.now()}`, label: "Section", minutes: 30, color: "#2563eb" }],
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
      segments: [...block.segments, { id: `seg-${Date.now()}`, label: "New section", minutes: 5, color: block.color }],
    } : block);
    renderApp();
  }
  if (action === "delete-section") {
    const row = button.closest("[data-segment-id]");
    state.schedule.blocks = state.schedule.blocks.map((block) => block.id === row.dataset.blockId ? {
      ...block,
      segments: block.segments.filter((segment) => segment.id !== row.dataset.segmentId),
    } : block);
    renderApp();
  }
  if (action === "theme") {
    state.schedule.theme.background = button.dataset.theme;
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

bootstrap();
