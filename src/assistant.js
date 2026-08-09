const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#dc2626", "#0891b2", "#4f46e5", "#16a34a"];
const THEMES = new Set(["aurora", "matrix", "sunrise", "chalk", "orbit"]);

function toId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function parseLooseTime(raw, contextMinutes = null) {
  const match = String(raw || "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) {
    return null;
  }
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.replace(/\./g, "");

  if (hours > 24 || minutes > 59) {
    return null;
  }

  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  }
  if (meridiem === "am" && hours === 12) {
    hours = 0;
  }
  if (!meridiem && contextMinutes !== null && hours < 8) {
    const candidate = hours * 60 + minutes;
    if (candidate + 12 * 60 > contextMinutes) {
      hours += 12;
    }
  }
  return hours * 60 + minutes;
}

function durationMinutes(block) {
  const start = timeToMinutes(block.start) ?? 0;
  const end = timeToMinutes(block.end) ?? start;
  return Math.max(1, end - start);
}

function defaultSegments(block) {
  const duration = durationMinutes(block);
  if (duration <= 12) {
    return [{ id: toId("seg"), label: "Launch", minutes: duration, color: block.color }];
  }
  const warmup = Math.min(8, Math.max(4, Math.round(duration * 0.15)));
  const wrap = Math.min(7, Math.max(3, Math.round(duration * 0.12)));
  const practice = Math.max(5, duration - warmup - wrap);
  return [
    { id: toId("seg"), label: "Warm-up", minutes: warmup, color: block.color },
    { id: toId("seg"), label: "Guided practice", minutes: practice, color: block.color },
    { id: toId("seg"), label: "Wrap-up", minutes: wrap, color: block.color },
  ];
}

export function defaultSchedule(title = "My TechClass") {
  const blocks = [
    { label: "Arrival Studio", start: "08:00", end: "08:15", kind: "launch", color: COLORS[0] },
    { label: "Digital Lab A", start: "08:15", end: "09:00", kind: "lab", color: COLORS[1] },
    { label: "Project Sprint", start: "09:05", end: "09:50", kind: "project", color: COLORS[2] },
    { label: "Creation Block", start: "10:00", end: "10:45", kind: "create", color: COLORS[3] },
    { label: "Reflection", start: "10:45", end: "11:00", kind: "reflect", color: COLORS[4] },
  ].map((block) => ({ id: toId("block"), ...block, segments: defaultSegments(block) }));

  return {
    title,
    timezone: "America/Chicago",
    blocks,
    theme: {
      background: "aurora",
      accent: "#2563eb",
      motion: "calm",
      timerStyle: "ring",
    },
  };
}

export function normalizeSchedule(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Schedule must be an object.");
  }

  const title = String(input.title || "My TechClass").trim().slice(0, 80) || "My TechClass";
  const timezone = String(input.timezone || "America/Chicago").trim().slice(0, 80) || "America/Chicago";
  const themeInput = input.theme && typeof input.theme === "object" ? input.theme : {};
  const theme = {
    background: THEMES.has(themeInput.background) ? themeInput.background : "aurora",
    accent: /^#[0-9a-f]{6}$/i.test(themeInput.accent || "") ? themeInput.accent : "#2563eb",
    motion: ["calm", "lively", "focus"].includes(themeInput.motion) ? themeInput.motion : "calm",
    timerStyle: ["ring", "bar", "minimal"].includes(themeInput.timerStyle) ? themeInput.timerStyle : "ring",
  };

  const blocks = Array.isArray(input.blocks) ? input.blocks : [];
  const normalizedBlocks = blocks.slice(0, 24).map((block, index) => {
    const start = typeof block.start === "string" ? block.start : "08:00";
    const end = typeof block.end === "string" ? block.end : "08:30";
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      throw new Error(`Block ${index + 1} needs a valid start and end time.`);
    }
    const color = /^#[0-9a-f]{6}$/i.test(block.color || "") ? block.color : COLORS[index % COLORS.length];
    const cleanBlock = {
      id: String(block.id || toId("block")).slice(0, 40),
      label: String(block.label || `Block ${index + 1}`).trim().slice(0, 60) || `Block ${index + 1}`,
      start,
      end,
      kind: String(block.kind || "class").trim().slice(0, 40) || "class",
      color,
      segments: [],
    };
    const rawSegments = Array.isArray(block.segments) ? block.segments : defaultSegments(cleanBlock);
    cleanBlock.segments = rawSegments.slice(0, 8).map((segment, segmentIndex) => ({
      id: String(segment.id || toId("seg")).slice(0, 40),
      label: String(segment.label || `Section ${segmentIndex + 1}`).trim().slice(0, 50) || `Section ${segmentIndex + 1}`,
      minutes: Math.max(1, Math.min(240, Number(segment.minutes || 5))),
      color: /^#[0-9a-f]{6}$/i.test(segment.color || "") ? segment.color : color,
    }));
    return cleanBlock;
  }).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  if (!normalizedBlocks.length) {
    return defaultSchedule(title);
  }

  return { title, timezone, theme, blocks: normalizedBlocks };
}

function parseScheduleLines(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let lastStart = null;

  for (const line of lines) {
    const match = line.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|to|until|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+(.+)/i);
    if (!match) {
      continue;
    }
    const startMinutes = parseLooseTime(match[1], lastStart);
    let endMinutes = parseLooseTime(match[2], startMinutes);
    if (startMinutes === null || endMinutes === null) {
      continue;
    }
    if (endMinutes <= startMinutes) {
      endMinutes += 12 * 60;
    }
    const label = match[3].replace(/^[\-:|]+/, "").trim();
    const color = COLORS[blocks.length % COLORS.length];
    const block = {
      id: toId("block"),
      label: label.slice(0, 60) || `Block ${blocks.length + 1}`,
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      kind: "class",
      color,
    };
    block.segments = defaultSegments(block);
    blocks.push(block);
    lastStart = startMinutes;
  }

  return blocks;
}

function buildSectionPatch(schedule, message) {
  const lower = message.toLowerCase();
  if (!/(section|segment|b[oö]l|split|par[cç]a)/.test(lower)) {
    return null;
  }

  const blocks = schedule.blocks.map((block) => {
    const duration = durationMinutes(block);
    let segments;
    if (/(intro|explain|practice|exit|warm)/.test(lower)) {
      const intro = Math.max(5, Math.round(duration * 0.2));
      const practice = Math.max(8, Math.round(duration * 0.55));
      const exit = Math.max(4, duration - intro - practice);
      segments = [
        { id: toId("seg"), label: "Mini lesson", minutes: intro, color: block.color },
        { id: toId("seg"), label: "Hands-on practice", minutes: practice, color: block.color },
        { id: toId("seg"), label: "Exit ticket", minutes: exit, color: block.color },
      ];
    } else {
      segments = defaultSegments(block);
    }
    return { ...block, segments };
  });

  return { schedule: { ...schedule, blocks } };
}

function buildThemePatch(schedule, message) {
  const lower = message.toLowerCase();
  const theme = { ...schedule.theme };
  let changed = false;
  for (const name of THEMES) {
    if (lower.includes(name)) {
      theme.background = name;
      changed = true;
    }
  }
  if (/calm|slow|quiet|sakin/.test(lower)) {
    theme.motion = "calm";
    changed = true;
  }
  if (/lively|energetic|hizli|canl/.test(lower)) {
    theme.motion = "lively";
    changed = true;
  }
  if (/focus|minimal|plain|simple/.test(lower)) {
    theme.motion = "focus";
    theme.timerStyle = "minimal";
    changed = true;
  }
  const color = message.match(/#[0-9a-f]{6}/i)?.[0];
  if (color) {
    theme.accent = color;
    changed = true;
  }
  return changed ? { schedule: { ...schedule, theme } } : null;
}

export function buildAssistantResponse(message, currentSchedule) {
  const schedule = normalizeSchedule(currentSchedule);
  const parsedBlocks = parseScheduleLines(message);
  if (parsedBlocks.length >= 2) {
    const nextSchedule = normalizeSchedule({
      ...schedule,
      blocks: parsedBlocks,
    });
    return {
      reply: `I found ${parsedBlocks.length} time blocks. Review them, then apply the draft to replace your bell schedule.`,
      patch: { schedule: nextSchedule },
      intent: "replace_schedule",
    };
  }

  const sectionPatch = buildSectionPatch(schedule, message);
  if (sectionPatch) {
    return {
      reply: "I drafted section labels and minute splits for each class block. Apply it if this matches your classroom flow.",
      patch: sectionPatch,
      intent: "split_sections",
    };
  }

  const themePatch = buildThemePatch(schedule, message);
  if (themePatch) {
    return {
      reply: "I updated the visual theme draft. Apply it to save the new classroom display style.",
      patch: themePatch,
      intent: "theme",
    };
  }

  return {
    reply: [
      "Paste a bell schedule like:",
      "8:00-8:15 Arrival",
      "8:15-9:00 Grade 3 Lab",
      "Or ask: split each class into mini lesson, practice, and exit ticket.",
    ].join("\n"),
    patch: null,
    intent: "help",
  };
}
