const COLORS = ["#2563eb", "#0f766e", "#9333ea", "#d97706", "#dc2626", "#0891b2", "#4f46e5", "#16a34a"];
const THEMES = new Set(["aurora", "matrix", "sunrise", "chalk", "orbit"]);
const MODES = new Set(["real", "sim", "flash"]);
const MAX_SECTIONS = 5;
const SECTION_IMAGES = [
  "/assets/cls/login.png",
  "/assets/cls/learning.png",
  "/assets/cls/typing.png",
  "/assets/cls/nitrotype.jpg",
  "/assets/cls/logout4.png",
  "/assets/cls/abc.jpg",
  "/assets/cls/pbs.png",
];
const WEEK_DAYS = [
  { key: "monday", label: "Monday", aliases: ["mon", "monday"] },
  { key: "tuesday", label: "Tuesday", aliases: ["tue", "tues", "tuesday"] },
  { key: "wednesday", label: "Wednesday", aliases: ["wed", "wednesday"] },
  { key: "thursday", label: "Thursday", aliases: ["thu", "thur", "thurs", "thursday"] },
  { key: "friday", label: "Friday", aliases: ["fri", "friday"] },
];
const CLS_MON_THU = [
  ["Period 1", "07:50", "08:38"],
  ["Period 2", "08:41", "09:29"],
  ["Period 3", "09:32", "10:20"],
  ["Period 4", "10:23", "11:10"],
  ["Period 5", "11:13", "12:01"],
  ["Period 6", "12:04", "12:52"],
  ["Period 7", "12:55", "13:43"],
  ["Period 8", "13:46", "14:34"],
  ["Period 9", "14:37", "15:25"],
];
const CLS_FRIDAY = [
  ["Period 1", "07:50", "08:34"],
  ["Period 2", "08:37", "09:21"],
  ["Period 3", "09:24", "10:08"],
  ["Period 4", "10:11", "10:54"],
  ["Period 5", "10:57", "11:41"],
  ["Period 6", "11:44", "12:28"],
  ["Period 7", "12:31", "13:15"],
];

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

function cleanImageUrl(value, fallback = SECTION_IMAGES[0]) {
  const imageUrl = String(value || "").trim();
  if (SECTION_IMAGES.includes(imageUrl)) {
    return imageUrl;
  }
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageUrl) && imageUrl.length <= 1_500_000) {
    return imageUrl;
  }
  return fallback;
}

function defaultSegments(block) {
  const duration = durationMinutes(block);
  if (duration <= 1) {
    return [{ id: toId("seg"), label: "Login", minutes: 1, color: block.color, imageUrl: SECTION_IMAGES[0] }];
  }
  if (duration <= 6) {
    return [
      { id: toId("seg"), label: "Login", minutes: Math.max(1, Math.floor(duration / 2)), color: block.color, imageUrl: SECTION_IMAGES[0] },
      { id: toId("seg"), label: "Logout", minutes: Math.max(1, Math.ceil(duration / 2)), color: block.color, imageUrl: SECTION_IMAGES[4] },
    ];
  }

  const login = Math.min(3, Math.max(1, Math.round(duration * 0.08)));
  const logout = Math.min(2, Math.max(1, Math.round(duration * 0.06)));
  const typing = Math.min(10, Math.max(2, Math.round(duration * 0.22)));
  const learning = Math.max(1, duration - login - typing - logout);
  return [
    { id: toId("seg"), label: "Login", minutes: login, color: block.color, imageUrl: SECTION_IMAGES[0] },
    { id: toId("seg"), label: "Learning", minutes: learning, color: block.color, imageUrl: SECTION_IMAGES[1] },
    { id: toId("seg"), label: "Typing", minutes: typing, color: block.color, imageUrl: SECTION_IMAGES[2] },
    { id: toId("seg"), label: "Logout", minutes: logout, color: block.color, imageUrl: SECTION_IMAGES[4] },
  ];
}

function cloneBlock(block, index = 0) {
  return {
    ...block,
    id: toId("block"),
    color: block.color || COLORS[index % COLORS.length],
    segments: (block.segments?.length ? block.segments : defaultSegments(block)).map((segment, segmentIndex) => ({
      ...segment,
      id: toId("seg"),
      color: segment.color || block.color || COLORS[index % COLORS.length],
      imageUrl: cleanImageUrl(segment.imageUrl, SECTION_IMAGES[segmentIndex % SECTION_IMAGES.length]),
    })),
  };
}

function normalizeBlocks(blocksInput, fallbackBlocks = []) {
  const blocks = Array.isArray(blocksInput) ? blocksInput : fallbackBlocks;
  const normalized = blocks.slice(0, 24).map((block, index) => {
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
    cleanBlock.segments = rawSegments.slice(0, MAX_SECTIONS).map((segment, segmentIndex) => ({
      id: String(segment.id || toId("seg")).slice(0, 40),
      label: String(segment.label || `Section ${segmentIndex + 1}`).trim().slice(0, 50) || `Section ${segmentIndex + 1}`,
      minutes: Math.max(1, Math.min(240, Number(segment.minutes || 5))),
      color: /^#[0-9a-f]{6}$/i.test(segment.color || "") ? segment.color : color,
      imageUrl: cleanImageUrl(segment.imageUrl, SECTION_IMAGES[segmentIndex % SECTION_IMAGES.length]),
    }));
    return cleanBlock;
  }).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return normalized;
}

function clsBlocks(template) {
  return template.map(([label, start, end], index) => {
    const block = { id: toId("block"), label, start, end, kind: "class", color: COLORS[index % COLORS.length] };
    return { ...block, segments: defaultSegments(block) };
  });
}

export function clsWeekSchedule() {
  return WEEK_DAYS.reduce((week, day) => {
    const template = day.key === "friday" ? CLS_FRIDAY : CLS_MON_THU;
    week[day.key] = {
      label: day.label,
      blocks: normalizeBlocks(clsBlocks(template)),
    };
    return week;
  }, {});
}

function weekFromBlocks(blocks) {
  return WEEK_DAYS.reduce((week, day) => {
    week[day.key] = {
      label: day.label,
      blocks: blocks.map((block, index) => cloneBlock(block, index)),
    };
    return week;
  }, {});
}

function normalizeWeek(inputWeek, fallbackBlocks) {
  const source = inputWeek && typeof inputWeek === "object" ? inputWeek : {};
  return WEEK_DAYS.reduce((week, day) => {
    const value = source[day.key];
    const blocks = Array.isArray(value?.blocks) ? value.blocks : Array.isArray(value) ? value : null;
    week[day.key] = {
      label: day.label,
      blocks: blocks ? normalizeBlocks(blocks) : fallbackBlocks.map((block, index) => cloneBlock(block, index)),
    };
    return week;
  }, {});
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
    week: clsWeekSchedule(),
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
    mode: MODES.has(themeInput.mode) ? themeInput.mode : "real",
  };

  const normalizedBlocks = normalizeBlocks(input.blocks);

  if (!normalizedBlocks.length) {
    return defaultSchedule(title);
  }

  const week = input.week ? normalizeWeek(input.week, normalizedBlocks) : weekFromBlocks(normalizedBlocks);
  return { title, timezone, theme, blocks: normalizedBlocks, week };
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

function parseWeeklySchedule(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const week = {};
  let activeDay = null;
  let lastStart = null;

  function lineDayKey(line) {
    const normalized = line.toLowerCase().replace(/[:\-]+$/g, "").trim();
    const direct = WEEK_DAYS.find((day) => day.aliases.includes(normalized));
    if (direct) {
      return direct.key;
    }
    const inline = normalized.match(/^(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)\b/);
    return inline ? WEEK_DAYS.find((day) => day.aliases.includes(inline[1]))?.key || null : null;
  }

  function parseLine(line, index = 0) {
    const match = line.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|to|until|â€“|â€”)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+(.+)/i);
    if (!match) {
      return null;
    }
    const startMinutes = parseLooseTime(match[1], lastStart);
    let endMinutes = parseLooseTime(match[2], startMinutes);
    if (startMinutes === null || endMinutes === null) {
      return null;
    }
    if (endMinutes <= startMinutes) {
      endMinutes += 12 * 60;
    }
    const color = COLORS[index % COLORS.length];
    const block = {
      id: toId("block"),
      label: match[3].replace(/^[\-:|]+/, "").trim().slice(0, 60) || `Block ${index + 1}`,
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      kind: "class",
      color,
    };
    block.segments = defaultSegments(block);
    return { block, startMinutes };
  }

  for (const line of lines) {
    const dayKey = lineDayKey(line);
    const inlineLine = dayKey ? line.replace(/^[a-z]+\s*:?\s*/i, "") : line;
    const parsedInline = dayKey ? parseLine(inlineLine, week[dayKey]?.length || 0) : null;
    if (dayKey && !parsedInline) {
      activeDay = dayKey;
      lastStart = null;
      week[activeDay] ||= [];
      continue;
    }
    if (dayKey && parsedInline) {
      activeDay = dayKey;
      week[activeDay] ||= [];
      week[activeDay].push(parsedInline.block);
      lastStart = parsedInline.startMinutes;
      continue;
    }
    if (!activeDay) {
      continue;
    }
    const parsed = parseLine(line, week[activeDay].length);
    if (!parsed) {
      continue;
    }
    week[activeDay].push(parsed.block);
    lastStart = parsed.startMinutes;
  }

  const totalBlocks = Object.values(week).reduce((sum, blocks) => sum + blocks.length, 0);
  if (totalBlocks < 2) {
    return null;
  }
  return WEEK_DAYS.filter((day) => week[day.key]?.length).reduce((result, day) => {
    result[day.key] = { label: day.label, blocks: week[day.key] };
    return result;
  }, {});
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
  const lower = message.toLowerCase();
  if (/cls.*week|weekly.*cls|use cls|cls schedule/.test(lower)) {
    return {
      reply: "I drafted the CLS weekly schedule with Monday-Thursday periods and the shorter Friday flow. Apply it to update the weekly planner.",
      patch: { schedule: normalizeSchedule({ ...schedule, week: clsWeekSchedule() }) },
      intent: "cls_week",
    };
  }

  const parsedWeek = parseWeeklySchedule(message);
  if (parsedWeek) {
    const firstDay = WEEK_DAYS.find((day) => parsedWeek[day.key]?.blocks?.length);
    const nextBlocks = firstDay ? parsedWeek[firstDay.key].blocks : schedule.blocks;
    const nextSchedule = normalizeSchedule({
      ...schedule,
      blocks: nextBlocks,
      week: {
        ...schedule.week,
        ...parsedWeek,
      },
    });
    return {
      reply: `I found a weekly schedule across ${Object.values(parsedWeek).filter((day) => day.blocks.length).length} day(s). Apply it to update the weekly planner and set the daily bell schedule to the first pasted day.`,
      patch: { schedule: nextSchedule },
      intent: "weekly_schedule",
    };
  }

  const parsedBlocks = parseScheduleLines(message);
  if (parsedBlocks.length >= 2) {
    const nextSchedule = normalizeSchedule({
      ...schedule,
      blocks: parsedBlocks,
      week: {
        ...schedule.week,
        monday: { label: "Monday", blocks: parsedBlocks },
      },
    });
    return {
      reply: `I found ${parsedBlocks.length} time blocks. Review them, then apply the draft to replace your bell schedule and Monday weekly plan.`,
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
