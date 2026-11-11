/*
  Liftnote — plugin original para Obsidian
  UI inspirada en trackers modernos de gimnasio (oscuro + violeta)
  Optimizado para iPhone / Obsidian móvil
  + Calendario con asignación manual de rutina por día
*/

const { Plugin, ItemView, Notice, Modal, Setting, MarkdownRenderer } = require("obsidian");

const VIEW_TYPE = "liftnote-view";
const PLUGIN_ID = "liftnote";

// ── Utilidades ──────────────────────────────────────────────────────────────
function hoyISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function horaAhora() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
/**
 * Nombre de archivo seguro para iOS/Obsidian/zip:
 * - Reemplaza em dash, en dash, emojis y caracteres raros
 * - Evita el mojibake "ΓÇö" que aparece al transferir "—"
 */
function lnSafeFileName(texto, fallback = "Sesion") {
  let s = String(texto || "");
  // Mojibake habitual del em dash UTF-8 leído como Latin-1/Windows-1252
  s = s.replace(/ΓÇö/g, "-").replace(/ΓÇô/g, "-").replace(/â€”/g, "-").replace(/â€“/g, "-");
  // Mojibake frecuente de emoji 😴 / similares
  s = s.replace(/≡[^\sA-Za-zÁÉÍÓÚáéíóúñÑ]*/g, "").replace(/ðŸ˜´/g, "").replace(/ðŸ¤"/g, "");
  // Guiones tipográficos → guion simple
  s = s.replace(/[\u2014\u2013\u2012\u2010\u2212]/g, "-");
  // Quitar emojis y símbolos no básicos
  try {
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "");
  } catch (_) {
    // fallback sin flag u
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  }
  // Caracteres prohibidos en archivos
  s = s.replace(/[\\/:*?"<>|]/g, "-");
  // Colapsar espacios/guiones repetidos
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
  if (!s || /^[\s\-_.]+$/.test(s)) s = fallback;
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s;
}

// ── Grupos musculares (base de ejercicios) ─────────────────────────────────
const GRUPOS_MUSCULARES = [
  "Abdomen",
  "Pecho",
  "Espalda",
  "Bíceps",
  "Tríceps",
  "Piernas",
  "Hombros",
  "Trapecios",
];

// Miniaturas offline (SVG inline, ~1 KB total). Sin internet.
const LN_EJ_ICONS = {
  // Mapas musculares (cuerpo gris + zona en azul). Offline y ligeros.
  abdomen: { label: "Abdomen", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="12" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 20c2-2 6-3 10-3s8 1 10 3v10c-2 1-6 2-10 2s-8-1-10-2V20z" fill="#c5c9d1"/><path d="M26 24c1 0 3-.5 6-.5s5 .5 6 .5v12c-1.5 1-4 1.5-6 1.5s-4.5-.5-6-1.5V24z" fill="#3b82f6"/><path d="M26 26.5h12M26 30h12M27 33.5h10" stroke="#60a5fa" stroke-width="1.2" opacity=".7"/><path d="M24 42l-3 14h6l1-8 4 8h6l1-8 1 8h6l-3-14H24z" fill="#c5c9d1"/><path d="M18 22c-3 2-5 5-5 8M46 22c3 2 5 5 5 8" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/></svg>` },
  pecho: { label: "Pecho", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="11" rx="7" ry="8" fill="#c5c9d1"/><path d="M20 19c3-2 8-3 12-3s9 1 12 3v8c-3 2-8 3-12 3s-9-1-12-3v-8z" fill="#c5c9d1"/><path d="M22 21c2-1 6-2 10-2s8 1 10 2v7c-2 1.5-6 2.5-10 2.5S24 29.5 22 28V21z" fill="#3b82f6"/><path d="M32 21v10.5" stroke="#60a5fa" stroke-width="1.2" opacity=".6"/><path d="M18 22c-4 3-6 7-6 11M46 22c4 3 6 7 6 11" stroke="#c5c9d1" stroke-width="4.5" stroke-linecap="round"/><path d="M24 34v4c0 2 2 3 4 3h8c2 0 4-1 4-3v-4H24z" fill="#c5c9d1"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  espalda: { label: "Espalda", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="11" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 19c2-1 6-2 10-2s8 1 10 2v16c-2 1-6 2-10 2s-8-1-10-2V19z" fill="#c5c9d1"/><path d="M24 20c-1 4-2 9 0 14 2 1 5 2 8 2s6-1 8-2c2-5 1-10 0-14-2 3-5 5-8 5s-6-2-8-5z" fill="#3b82f6"/><path d="M32 20v16" stroke="#60a5fa" stroke-width="1.3" opacity=".5"/><path d="M18 22c-4 4-6 8-5 12M46 22c4 4 6 8 5 12" stroke="#c5c9d1" stroke-width="4.5" stroke-linecap="round"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  biceps: { label: "Bíceps", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="11" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 19c2-1 6-2 10-2s8 1 10 2v14c-2 1-6 2-10 2s-8-1-10-2V19z" fill="#c5c9d1"/><path d="M14 22c-1 3 0 7 2 10 1-2 2-4 3-5" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/><path d="M50 22c1 3 0 7-2 10-1-2-2-4-3-5" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/><path d="M12 24c0 4 1 8 3 10 2-1 3-3 4-5-1-2-2-3-2-5h-5z" fill="#3b82f6"/><path d="M52 24c0 4-1 8-3 10-2-1-3-3-4-5 1-2 2-3 2-5h5z" fill="#3b82f6"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  triceps: { label: "Tríceps", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="11" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 19c2-1 6-2 10-2s8 1 10 2v14c-2 1-6 2-10 2s-8-1-10-2V19z" fill="#c5c9d1"/><path d="M14 22c-2 4-2 9 0 13" stroke="#c5c9d1" stroke-width="5" stroke-linecap="round"/><path d="M50 22c2 4 2 9 0 13" stroke="#c5c9d1" stroke-width="5" stroke-linecap="round"/><path d="M11 24c-1 5 0 10 2 13 1-3 2-6 2-9 0-2 0-3-1-4h-3z" fill="#3b82f6"/><path d="M53 24c1 5 0 10-2 13-1-3-2-6-2-9 0-2 0-3 1-4h3z" fill="#3b82f6"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  piernas: { label: "Piernas", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="10" rx="6.5" ry="7.5" fill="#c5c9d1"/><path d="M23 18c2-1 5-2 9-2s7 1 9 2v12c-2 1-5 1.5-9 1.5s-7-.5-9-1.5V18z" fill="#c5c9d1"/><path d="M18 22c-3 2-4 5-4 8M46 22c3 2 4 5 4 8" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/><path d="M24 34l-4 22h9l3-14 3 14h9l-4-22H24z" fill="#c5c9d1"/><path d="M26 36l-3 18h6l2-12 2 12h6l-3-18H26z" fill="#3b82f6"/></svg>` },
  hombros: { label: "Hombros", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="12" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 20c2-1 6-2 10-2s8 1 10 2v12c-2 1-6 2-10 2s-8-1-10-2V20z" fill="#c5c9d1"/><path d="M18 20c-3 1-5 3-6 6 2 1 4 2 6 2V20z" fill="#3b82f6"/><path d="M46 20c3 1 5 3 6 6-2 1-4 2-6 2V20z" fill="#3b82f6"/><path d="M16 22c-4 3-6 7-5 11M48 22c4 3 6 7 5 11" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  trapecios: { label: "Trapecios", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="11" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 19c2-1 6-2 10-2s8 1 10 2v14c-2 1-6 2-10 2s-8-1-10-2V19z" fill="#c5c9d1"/><path d="M24 18c-2 2-3 5-2 8 2-1 5-2 10-2s8 1 10 2c1-3 0-6-2-8-2 2-5 3-8 3s-6-1-8-3z" fill="#3b82f6"/><path d="M32 16v10" stroke="#60a5fa" stroke-width="1.2" opacity=".5"/><path d="M18 22c-4 3-6 7-5 11M46 22c4 3 6 7 5 11" stroke="#c5c9d1" stroke-width="4.5" stroke-linecap="round"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
  // Equipo / movimiento: cuerpo neutro + acento (siguen siendo ligeros)
  barra: { label: "Barra", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="12" rx="6.5" ry="7.5" fill="#c5c9d1"/><path d="M24 20h16v10H24z" fill="#c5c9d1"/><path d="M12 22h40" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><rect x="8" y="18" width="6" height="10" rx="1.5" fill="#475569"/><rect x="50" y="18" width="6" height="10" rx="1.5" fill="#475569"/><path d="M26 32l-3 20h8l1-12 2 12h8l-3-20H26z" fill="#c5c9d1"/></svg>` },
  mancuerna: { label: "Mancuerna", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="12" rx="6.5" ry="7.5" fill="#c5c9d1"/><path d="M25 20h14v12H25z" fill="#c5c9d1"/><path d="M10 24h12M42 24h12" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><rect x="6" y="19" width="8" height="12" rx="2" fill="#475569"/><rect x="50" y="19" width="8" height="12" rx="2" fill="#475569"/><path d="M26 34l-3 18h8l2-12 2 12h8l-3-18H26z" fill="#c5c9d1"/></svg>` },
  cable: { label: "Cable", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><path d="M46 8v18" stroke="#94a3b8" stroke-width="2"/><circle cx="46" cy="10" r="3" fill="#f59e0b"/><ellipse cx="30" cy="14" rx="6.5" ry="7.5" fill="#c5c9d1"/><path d="M23 22h16v10H23z" fill="#c5c9d1"/><path d="M46 26c-4 1-10 2-14 2" stroke="#94a3b8" stroke-width="2"/><path d="M26 36l-3 18h8l2-12 2 12h8l-3-18H26z" fill="#c5c9d1"/></svg>` },
  maquina: { label: "Máquina", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><rect x="8" y="10" width="16" height="32" rx="3" fill="#94a3b8"/><rect x="11" y="14" width="10" height="5" rx="1" fill="#cbd5e1"/><ellipse cx="40" cy="14" rx="6" ry="7" fill="#c5c9d1"/><path d="M33 22h14v10H33z" fill="#c5c9d1"/><path d="M28 28h-6" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"/><path d="M34 36l-2 16h8l1-10 2 10h8l-3-16H34z" fill="#c5c9d1"/></svg>` },
  peso_muerto: { label: "Peso muerto", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="10" rx="6" ry="7" fill="#c5c9d1"/><path d="M25 18h14v8H25z" fill="#c5c9d1"/><path d="M24 26c2 3 5 6 8 7 3-1 6-4 8-7" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/><path d="M14 36h36" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><rect x="10" y="32" width="7" height="12" rx="1.5" fill="#475569"/><rect x="47" y="32" width="7" height="12" rx="1.5" fill="#475569"/><path d="M28 26l-2 10M36 26l2 10" stroke="#c5c9d1" stroke-width="3" stroke-linecap="round"/></svg>` },
  sentadilla: { label: "Sentadilla", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="10" rx="6" ry="7" fill="#c5c9d1"/><path d="M14 16h36" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"/><path d="M26 16h12v8H26z" fill="#c5c9d1"/><path d="M24 24c2 2 4 4 8 4s6-2 8-4l-3 8H27l-3-8z" fill="#c5c9d1"/><path d="M27 32l-5 20h9l3-12 3 12h9l-5-20H27z" fill="#c5c9d1"/><path d="M29 34l-3 16h6l2-10 2 10h6l-3-16H29z" fill="#3b82f6"/></svg>` },
  press: { label: "Press", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><path d="M10 44h44v6H10z" fill="#94a3b8"/><ellipse cx="32" cy="16" rx="6.5" ry="7.5" fill="#c5c9d1"/><path d="M24 24h16v8c-2 1-5 2-8 2s-6-1-8-2v-8z" fill="#c5c9d1"/><path d="M24 25c2-1 5-1.5 8-1.5s6 .5 8 1.5v5c-2 1-5 1.5-8 1.5s-6-.5-8-1.5v-5z" fill="#3b82f6"/><path d="M14 22h36" stroke="#64748b" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="22" r="3.5" fill="#475569"/><circle cx="52" cy="22" r="3.5" fill="#475569"/></svg>` },
  generico: { label: "Genérico", svg: `<svg viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="32" fill="#eef0f4"/><ellipse cx="32" cy="12" rx="7" ry="8" fill="#c5c9d1"/><path d="M22 20c2-1 6-2 10-2s8 1 10 2v12c-2 1-6 2-10 2s-8-1-10-2V20z" fill="#c5c9d1"/><path d="M16 22c-3 3-5 6-4 10M48 22c3 3 5 6 4 10" stroke="#c5c9d1" stroke-width="4" stroke-linecap="round"/><path d="M24 42l-3 14h7l2-10 3 10h6l3-10 2 10h7l-3-14H24z" fill="#c5c9d1"/></svg>` },
};

const LN_EJ_ICON_KEYS = Object.keys(LN_EJ_ICONS);

function lnIconSvg(key) {
  const k = (key || "").toLowerCase().trim();
  if (LN_EJ_ICONS[k]) return LN_EJ_ICONS[k].svg;
  return LN_EJ_ICONS.generico.svg;
}

/** Sugiere icono según grupo muscular o nombre del ejercicio. */
function lnInferirIcono(nombre, grupo) {
  const g = (grupo || "").toLowerCase();
  const n = (nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/peso muerto|deadlift/.test(n)) return "peso_muerto";
  if (/sentadilla|squat|prensa|hack/.test(n)) return "sentadilla";
  if (/press|banca|militar/.test(n)) return "press";
  if (/mancuerna|dumbbell/.test(n)) return "mancuerna";
  if (/barra|barbell|ez/.test(n)) return "barra";
  if (/cable|polea|jalon|face pull/.test(n)) return "cable";
  if (/maquina|máquina|smith|iso/.test(n)) return "maquina";
  if (g.includes("abdomen")) return "abdomen";
  if (g.includes("pecho")) return "pecho";
  if (g.includes("espalda")) return "espalda";
  if (g.includes("bíceps") || g.includes("biceps")) return "biceps";
  if (g.includes("tríceps") || g.includes("triceps")) return "triceps";
  if (g.includes("pierna")) return "piernas";
  if (g.includes("hombro")) return "hombros";
  if (g.includes("trapecio")) return "trapecios";
  return "generico";
}

function lnGrupoToIconKey(grupo) {
  const map = {
    Abdomen: "abdomen",
    Pecho: "pecho",
    Espalda: "espalda",
    "Bíceps": "biceps",
    "Tríceps": "triceps",
    Piernas: "piernas",
    Hombros: "hombros",
    Trapecios: "trapecios",
  };
  return map[grupo] || "generico";
}


/** Extrae el nombre legible de un item de bdEjercicios (string u objeto). */
function lnNombreEj(item) {
  if (item == null) return "";
  if (typeof item === "string") return item.trim();
  if (typeof item === "object" && item.nombre != null) return String(item.nombre).trim();
  return String(item).trim();
}

/** Extrae el grupo muscular de un item de bdEjercicios. */
function lnGrupoEj(item) {
  if (item == null) return "";
  if (typeof item === "object" && item.grupo != null) return String(item.grupo).trim();
  return "";
}

/** Normaliza un item a { nombre, grupo, icon }. */
function lnNormEj(item) {
  const nombre = lnNombreEj(item);
  const grupo = lnGrupoEj(item);
  let icon = "";
  if (item && typeof item === "object" && item.icon) icon = String(item.icon).trim();
  if (!icon) icon = lnInferirIcono(nombre, grupo);
  return { nombre, grupo: grupo || "", icon };
}

/** Heurística para asignar grupo muscular a ejercicios existentes por nombre. */
function lnInferirGrupo(nombre) {
  const n = (nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!n) return "";
  // Abdomen
  if (/abdom|crunch|plancha|hollow|leg raise|elevacion de piernas|russian|twist/.test(n)) return "Abdomen";
  // Pecho
  if (/press de banca|press banca|press de pecho|apertura|aperturas|fondos de pecho|pullover|press inclinado|press declinado|press hexagonal|press pecho/.test(n)) return "Pecho";
  // Trapecios (antes que espalda/hombros por "encogimiento")
  if (/encogimiento|trapecio|shrug/.test(n)) return "Trapecios";
  // Espalda
  if (/remo|jalon|dominada|pull.?up|serrucho|face pull|peso muerto|hip thrust|pullover/.test(n) && !/triceps|biceps|pecho/.test(n)) return "Espalda";
  if (/jalon|dominada|remo |peso muerto|hip thrust/.test(n)) return "Espalda";
  // Bíceps
  if (/curl|biceps|bíceps/.test(n) && !/femoral|pierna|cuadr/.test(n)) return "Bíceps";
  // Tríceps
  if (/triceps|tríceps|press frances|press francés|patada de triceps|fondo triceps|fondos triceps|copa|extension de triceps/.test(n)) return "Tríceps";
  // Piernas
  if (/sentadilla|prensa|zancada|gemelo|cuadr|femoral|abductor|aductor|pierna|hip thrust|peso muerto|extension de cuadr|curl femoral|hack|goblet|asalto/.test(n)) return "Piernas";
  // Hombros
  if (/elevacion|elevación|press militar|hombro|lateral|frontal|posterior con|vuelos posteriores|face pull/.test(n)) return "Hombros";
  return "";
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { data: {}, body: text };
  const data = {};
  m[1].split("\n").forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      data[k] = v;
    }
  });
  return { data, body: text.slice(m[0].length).trim() };
}
function parseRutinaMD(text) {
  const { data, body } = parseFrontmatter(text);
  const ejercicios = [];
  let actual = null;
  body.split("\n").forEach((line) => {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      actual = { nombre: h[1].trim(), series: 3, reps: "8-12", peso: "", descanso: 90, notas: "", superserie: false };
      ejercicios.push(actual);
      return;
    }
    if (!actual) return;
    const s = line.match(/series:\s*(\d+)/i);
    if (s) actual.series = parseInt(s[1], 10);
    const r = line.match(/reps:\s*(.+)/i);
    if (r) actual.reps = r[1].trim();
    const p = line.match(/peso:\s*(.+)/i);
    if (p) actual.peso = p[1].trim();
    const d = line.match(/descanso:\s*(\d+)/i);
    if (d) actual.descanso = parseInt(d[1], 10);
    const n = line.match(/notas:\s*(.+)/i);
    if (n) actual.notas = n[1].trim();
    // superserie / en serie: si | true | 1 | sí
    const ss = line.match(/(?:superserie|en_serie|enseríe|en serie):\s*(.+)/i);
    if (ss) {
      const v = ss[1].trim().toLowerCase();
      actual.superserie = /^(si|sí|true|1|yes|x)$/i.test(v);
    }
  });
  return {
    nombre: data.nombre || "Rutina",
    tipo: data.tipo || "planificada",
    ejercicios,
  };
}
function rutinaToMD(rutina) {
  let md = `---\nnombre: "${rutina.nombre}"\ntipo: ${rutina.tipo || "planificada"}\n---\n\n`;
  rutina.ejercicios.forEach((ej) => {
    md += `## ${ej.nombre}\n`;
    md += `- series: ${ej.series || 3}\n`;
    md += `- reps: ${ej.reps || "8-12"}\n`;
    if (ej.peso) md += `- peso: ${ej.peso}\n`;
    md += `- descanso: ${ej.descanso || 90}\n`;
    if (ej.notas) md += `- notas: ${ej.notas}\n`;
    if (ej.superserie) md += `- superserie: si\n`;
    md += `\n`;
  });
  return md;
}
function sesionToMD(sesion) {
  const u = lnNormUnidad(sesion.unidad || "kg");
  const uTxt = u === "lbs" ? "lbs" : "kg";
  // Calcular volumen de series hechas
  let volumen = 0;
  (sesion.ejercicios || []).forEach((ej) => {
    (ej.sets || []).forEach((s) => {
      if (!s.hecho) return;
      const p = parseFloat(s.peso);
      const r = parseInt(s.reps, 10);
      if (!isNaN(p) && p > 0 && !isNaN(r) && r > 0) volumen += p * r;
    });
  });
  volumen = Math.round(volumen);
  let md = `---\nrutina: "${sesion.rutina}"\nfecha: ${sesion.fecha}\ninicio: ${sesion.inicio}\nfin: ${sesion.fin || ""}\nduracion_min: ${sesion.duracionMin || 0}\nunidad: ${uTxt}\nvolumen: ${volumen}\n---\n\n`;
  sesion.ejercicios.forEach((ej) => {
    md += `## ${ej.nombre}\n`;
    ej.sets.forEach((s, i) => {
      if (s.hecho) {
        const esFallo = s.reps === "∞" || s.reps === "inf" || String(s.reps).toLowerCase() === "al fallo";
        if (esFallo) {
          md += `- Serie ${i + 1}: ${s.peso || 0} ${uTxt} × ∞ (al fallo)\n`;
        } else {
          md += `- Serie ${i + 1}: ${s.peso || 0} ${uTxt} × ${s.reps || 0} reps\n`;
        }
      } else if (s.saltada) {
        md += `- Serie ${i + 1}: saltada\n`;
      }
    });
    md += `\n`;
  });
  if (volumen > 0) md += `**Volumen total:** ${volumen} ${uTxt}\n\n`;
  if (sesion.notas) md += `### Notas\n${sesion.notas}\n`;
  return md;
}

function formatVolumen(n, unidad = "kg") {
  if (!n || n === 0) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k " + unidad;
  return Math.round(n) + " " + unidad;
}

/** Nombre del mes en español a partir de fecha YYYY-MM-DD */
function nombreMesES(fechaISO) {
  const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  if (!fechaISO || fechaISO.length < 7) return "Sin fecha";
  const m = parseInt(fechaISO.slice(5, 7), 10);
  if (isNaN(m) || m < 1 || m > 12) return "Sin fecha";
  return MESES[m - 1];
}

/**
 * Detecta si un nombre de asignación es día especial.
 * @returns {"descanso"|"enfermo"|null}
 */
function tipoDiaEspecial(nombre) {
  const n = String(nombre || "").trim().toLowerCase();
  if (!n) return null;
  // Descanso: emoji, palabras clave
  if (
    n === "😴" || n === "💤" || n === "🛏" || n === "bed" ||
    /^(descanso|rest|off|día\s*libre|dia\s*libre|recovery|recuperación|recuperacion)$/i.test(n) ||
    /\bdescanso\b/.test(n)
  ) return "descanso";
  // Enfermo / lesión
  if (
    /enfermo|enfermedad|sick|ill|lesión|lesion|injured|injury|dolor|rehab/.test(n)
  ) return "enfermo";
  return null;
}

/** Normaliza etiqueta de unidad */
function lnNormUnidad(u) {
  const s = String(u || "kg").toLowerCase();
  if (s === "lb" || s === "lbs" || s === "libra" || s === "libras") return "lbs";
  return "kg";
}
function lnUnidadLabel(u) {
  return lnNormUnidad(u) === "lbs" ? "LB" : "KG";
}
/** Convierte un peso numérico entre kg y lbs. Devuelve string limpio. */
function lnConvertPeso(val, fromU, toU) {
  const from = lnNormUnidad(fromU);
  const to = lnNormUnidad(toU);
  if (from === to) return val;
  const n = parseFloat(String(val).replace(",", "."));
  if (isNaN(n) || n === 0) return val === 0 || val === "0" ? "0" : (val || "");
  let out;
  if (from === "kg" && to === "lbs") out = n * 2.2046226218;
  else out = n / 2.2046226218;
  // kg: 1 decimal; lbs: entero si >= 20, si no 1 decimal
  if (to === "kg") {
    out = Math.round(out * 10) / 10;
    return (Math.abs(out - Math.round(out)) < 1e-9) ? String(Math.round(out)) : out.toFixed(1);
  }
  out = Math.round(out * 10) / 10;
  if (out >= 20) return String(Math.round(out));
  return (Math.abs(out - Math.round(out)) < 1e-9) ? String(Math.round(out)) : out.toFixed(1);
}

// Beeps del temporizador (Web Audio — sin archivos externos)
let _lnAudioCtx = null;
function lnGetAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_lnAudioCtx) _lnAudioCtx = new AC();
    if (_lnAudioCtx.state === "suspended") _lnAudioCtx.resume();
    return _lnAudioCtx;
  } catch (_) {
    return null;
  }
}
function lnBeep({ freq = 880, dur = 0.12, type = "sine", vol = 0.25, when = 0 }) {
  const ctx = lnGetAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
/** Click corto de UI (pestañas y botones de navegación) */
function lnClick() {
  try {
    // Click nítido y corto (estilo botón físico)
    lnBeep({ freq: 1400, dur: 0.035, type: "sine", vol: 0.18 });
    lnBeep({ freq: 900, dur: 0.025, type: "triangle", vol: 0.10, when: 0.012 });
  } catch (_) {}
}
/** Voz hablada del temporizador (Web Speech API) */
function lnSpeak(text) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 1.0;
    // Preferir voz en español si existe
    const voices = window.speechSynthesis.getVoices() || [];
    const es = voices.find((v) => /es(-|_)?(ES|MX|US|AR)?/i.test(v.lang));
    if (es) u.voice = es;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}
function lnSpeakCountdown(secLeft) {
  if (secLeft === 10) {
    lnSpeak("Quedan diez segundos");
    return;
  }
  const map = {
    5: "cinco",
    4: "cuatro",
    3: "tres",
    2: "dos",
    1: "uno",
  };
  if (map[secLeft]) lnSpeak(map[secLeft]);
}
function lnSpeakFinish() {
  // Voz del DESCANSO entre series (sesión de entrenamiento)
  lnSpeak("Descanso terminado");
  try {
    lnBeep({ freq: 880, dur: 0.15, type: "square", vol: 0.22, when: 0 });
    lnBeep({ freq: 1320, dur: 0.25, type: "square", vol: 0.25, when: 0.18 });
  } catch (_) {}
}
function lnSpeakTimeFinish() {
  // Voz del temporizador de EJERCICIOS POR TIEMPO (pestaña Tiempo)
  lnSpeak("Tiempo finalizado");
  try {
    lnBeep({ freq: 880, dur: 0.15, type: "square", vol: 0.22, when: 0 });
    lnBeep({ freq: 1320, dur: 0.25, type: "square", vol: 0.25, when: 0.18 });
  } catch (_) {}
}

// ── Pantalla encendida + notificaciones locales ────────────────────────────
let _lnWakeLock = null;
async function lnRequestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) return false;
    if (_lnWakeLock) {
      try { await _lnWakeLock.release(); } catch (_) {}
      _lnWakeLock = null;
    }
    _lnWakeLock = await navigator.wakeLock.request("screen");
    _lnWakeLock.addEventListener("release", () => {
      _lnWakeLock = null;
    });
    return true;
  } catch (_) {
    return false;
  }
}
async function lnReleaseWakeLock() {
  try {
    if (_lnWakeLock) {
      await _lnWakeLock.release();
      _lnWakeLock = null;
    }
  } catch (_) {}
}
/** Re-pide wake lock al volver a primer plano (iOS lo suelta al minimizar). */
function lnBindWakeLockVisibility() {
  if (window._lnWakeVisBound) return;
  window._lnWakeVisBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window._lnSessionActiva) {
      lnRequestWakeLock();
    }
  });
}

let _lnNotifPerm = null; // "granted" | "denied" | "default" | null
async function lnEnsureNotifPermission() {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") {
      _lnNotifPerm = "granted";
      return true;
    }
    if (Notification.permission === "denied") {
      _lnNotifPerm = "denied";
      return false;
    }
    const p = await Notification.requestPermission();
    _lnNotifPerm = p;
    return p === "granted";
  } catch (_) {
    return false;
  }
}
function lnNotify(title, body, opts = {}) {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "granted") return false;
    const n = new Notification(title || "Liftnote", {
      body: body || "",
      tag: opts.tag || "liftnote-rest",
      renotify: true,
      silent: !!opts.silent,
      requireInteraction: !!opts.requireInteraction,
    });
    // Auto-cerrar a los 8s si el SO no lo hace
    setTimeout(() => {
      try { n.close(); } catch (_) {}
    }, 8000);
    return true;
  } catch (_) {
    return false;
  }
}



// ── Iconos SVG premium (estilo line / SF Symbols) ───────────────────────────
const LN_ICONS = {
  inicio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>`,
  ejercicio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8.5v7M17.5 8.5v7M4 10.5v3M20 10.5v3M6.5 12h11"/><rect x="2" y="9" width="2.5" height="6" rx="0.8"/><rect x="19.5" y="9" width="2.5" height="6" rx="0.8"/></svg>`,
  calendario: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  progresion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="M8 15v-3M12 15V9M16 15V6"/><path d="M8 12l4-3 4 2"/></svg>`,
  timer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M9 3h6M12 3v2"/></svg>`,
  cerrar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  editar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  nombre: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M6 16l3.5-10h1L14 16"/><path d="M7.2 13h5.6"/><path d="M16 8h4v2"/><path d="M18 8v8"/></svg>`,
  lista: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
};
function lnIcon(name) {
  return LN_ICONS[name] || "";
}

// ── Vista principal ─────────────────────────────────────────────────────────
class LiftnoteView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = "inicio"; // "inicio" | "ejercicio" | "calendario" | "progresion" | "timer"
    this.calMonth = new Date(); // mes visible del calendario
    // Estado del temporizador (persiste al cambiar de pestaña)
    this.timerTotal = 90; // segundos por defecto (descanso)
    this.timerLeft = 90;
    this.timerRunning = false;
    this.timerEndAt = 0; // timestamp absoluto → sigue corriendo en background
    this._timerInterval = null;
    this._timerVisHandler = null;
    this._timerUpdateUI = null;
    this._timerFinishNotified = false;
    this._timerWasRunning = false;
    this._timerLastSpoken = -1;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Liftnote";
  }
  getIcon() {
    return "dumbbell";
  }
  async onOpen() {
    await this.render();
  }
  async onClose() {}
  async render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("ln-vista");

    // Tabs con iconos premium SVG: Inicio · Ejercicio · Calendario · Progresión · Tiempo
    const tabs = root.createDiv({ cls: "ln-tabs ln-tabs-icons" });
    const tabDefs = [
      { id: "inicio", label: "Inicio", iconKey: "inicio" },
      { id: "ejercicio", label: "Ejercicio", iconKey: "ejercicio" },
      { id: "calendario", label: "Calendario", iconKey: "calendario" },
      { id: "progresion", label: "Progresión", iconKey: "progresion" },
      { id: "timer", label: "Tiempo", iconKey: "timer" },
    ];
    tabDefs.forEach((t) => {
      const btn = tabs.createEl("button", {
        cls: "ln-tab ln-tab-icon" + (this.tab === t.id ? " active" : ""),
        attr: { "aria-label": t.label },
      });
      const ico = btn.createEl("span", { cls: "ln-tab-ico" });
      ico.innerHTML = lnIcon(t.iconKey);
      btn.createEl("span", { text: t.label, cls: "ln-tab-lbl" });
      btn.onclick = () => {
        lnClick();
        this.tab = t.id;
        this.render();
      };
    });

    // Banner de entrenamiento en curso (minimizado)
    const activa = this.plugin.settings.sesionActiva;
    if (activa && activa.sesion && activa.sesion.fecha === hoyISO()) {
      const banner = root.createDiv({ cls: "ln-sesion-banner" });
      const info = banner.createDiv({ cls: "ln-sesion-banner-info" });
      info.createEl("div", { text: "Entrenamiento en curso", cls: "ln-sesion-banner-kicker" });
      info.createEl("div", {
        text: activa.rutinaNombre || activa.sesion.rutina || "Sesión",
        cls: "ln-sesion-banner-title",
      });
      const actions = banner.createDiv({ cls: "ln-sesion-banner-actions" });
      const btnGo = actions.createEl("button", { text: "Continuar", cls: "ln-btn ln-btn-primary ln-btn-sm" });
      btnGo.onclick = () => this.plugin.reanudarSesionActiva();
      const btnX = actions.createEl("button", { text: "Descartar", cls: "ln-btn ln-btn-ghost ln-btn-sm" });
      btnX.onclick = () => this.plugin.descartarSesionActiva();
    }

    if (this.tab === "inicio") {
      await this.renderHome(root);
      return;
    }
    if (this.tab === "ejercicio") {
      await this.renderEjercicio(root);
      return;
    }
    if (this.tab === "calendario") {
      await this.renderCalendario(root);
      return;
    }
    if (this.tab === "progresion") {
      await this.renderProgresion(root);
      return;
    }
    if (this.tab === "timer") {
      this.renderTemporizador(root);
      return;
    }
  }

  // ── Inicio: presentación premium ──────────────────────────────────────────
  async renderHome(root) {
    const hoy = new Date();
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const fechaTxt = `${hoy.getDate()} ${meses[hoy.getMonth()].toUpperCase()} · ${dias[hoy.getDay()].toUpperCase()}`;

    const rutinas = await this.plugin.listarRutinas();
    const hist = await this.plugin.listarHistorial(20);
    const sesionesMes = hist.filter((h) => (h.fecha || "").startsWith(hoyISO().slice(0, 7))).length;

    // Hero visual
    const hero = root.createDiv({ cls: "ln-hero" });
    const heroBg = hero.createDiv({ cls: "ln-hero-bg" });
    // Ilustración SVG abstracta (sin archivo externo)
    heroBg.innerHTML = `
      <svg class="ln-hero-art" viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="lnG1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#7c3aed"/>
            <stop offset="100%" stop-color="#22d3ee"/>
          </linearGradient>
          <linearGradient id="lnG2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        <rect width="400" height="220" fill="url(#lnG2)"/>
        <circle cx="320" cy="40" r="70" fill="#7c3aed" opacity="0.25"/>
        <circle cx="60" cy="180" r="50" fill="#22d3ee" opacity="0.15"/>
        <!-- mancuerna estilizada -->
        <g transform="translate(140,70)" fill="none" stroke="url(#lnG1)" stroke-width="8" stroke-linecap="round">
          <line x1="20" y1="40" x2="100" y2="40"/>
          <rect x="0" y="18" width="22" height="44" rx="6" fill="#a78bfa" stroke="none"/>
          <rect x="98" y="18" width="22" height="44" rx="6" fill="#22d3ee" stroke="none"/>
          <rect x="10" y="10" width="12" height="60" rx="4" fill="#c4b5fd" stroke="none" opacity="0.9"/>
          <rect x="108" y="10" width="12" height="60" rx="4" fill="#67e8f9" stroke="none" opacity="0.9"/>
        </g>
      </svg>
    `;

    const heroContent = hero.createDiv({ cls: "ln-hero-content" });
    heroContent.createEl("div", { text: "LIFTNOTE", cls: "ln-hero-brand" });
    heroContent.createEl("div", { text: fechaTxt, cls: "ln-hero-date" });
    heroContent.createEl("h1", { text: "Entrena con intención", cls: "ln-hero-title" });
    heroContent.createEl("p", {
      text: "Tu fuerza, tu ritmo. Elige una rutina y cierra el día más fuerte que ayer.",
      cls: "ln-hero-desc",
    });

    const cta = heroContent.createEl("button", {
      text: "ENTRENAR HOY  →",
      cls: "ln-btn ln-hero-cta",
    });
    cta.onclick = () => {
      lnClick();
      this.tab = "ejercicio";
      this.render();
    };

    // Stats rápidos
    const stats = root.createDiv({ cls: "ln-home-stats" });
    const s1 = stats.createDiv({ cls: "ln-stat" });
    s1.createEl("div", { text: String(rutinas.length), cls: "ln-stat-num" });
    s1.createEl("div", { text: "Rutinas", cls: "ln-stat-lbl" });
    const s2 = stats.createDiv({ cls: "ln-stat" });
    s2.createEl("div", { text: String(sesionesMes), cls: "ln-stat-num" });
    s2.createEl("div", { text: "Sesiones mes", cls: "ln-stat-lbl" });
    const s3 = stats.createDiv({ cls: "ln-stat" });
    s3.createEl("div", { text: String(hist.length), cls: "ln-stat-num" });
    s3.createEl("div", { text: "Historial", cls: "ln-stat-lbl" });

    // Accesos rápidos
    const quick = root.createDiv({ cls: "ln-home-quick" });
    quick.createEl("div", { text: "ACCESOS RÁPIDOS", cls: "ln-home-label" });
    const grid = quick.createDiv({ cls: "ln-home-grid" });
    const items = [
      { tab: "ejercicio", iconKey: "ejercicio", title: "Ejercicio", sub: "Tus rutinas" },
      { tab: "calendario", iconKey: "calendario", title: "Calendario", sub: "Planifica días" },
      { tab: "progresion", iconKey: "progresion", title: "Progresión", sub: "Pesos por mes" },
      { tab: "timer", iconKey: "timer", title: "Tiempo", sub: "Por tiempo" },
    ];
    items.forEach((it) => {
      const card = grid.createDiv({ cls: "ln-home-card" });
      const ico = card.createEl("div", { cls: "ln-home-card-ico" });
      ico.innerHTML = lnIcon(it.iconKey);
      card.createEl("div", { text: it.title, cls: "ln-home-card-title" });
      card.createEl("div", { text: it.sub, cls: "ln-home-card-sub" });
      card.onclick = () => {
        lnClick();
        this.tab = it.tab;
        this.render();
      };
    });
  }

  // ── Ejercicio: lista de rutinas ───────────────────────────────────────────
  async renderEjercicio(root) {
    const header = root.createDiv({ cls: "ln-page-head" });
    header.createEl("h1", { text: "Ejercicio", cls: "ln-page-title" });
    header.createEl("p", { text: "Tus rutinas de entrenamiento", cls: "ln-page-sub" });

    const actions = root.createDiv({ cls: "ln-actions ln-actions-premium" });
    const btnStart = actions.createEl("button", {
      text: "▶  Empezar entrenamiento",
      cls: "ln-btn ln-btn-primary ln-btn-lg ln-btn-glow",
    });
    btnStart.onclick = () => this.plugin.abrirSelectorRutina();

    // Entrenamiento libre: ir registrando ejercicios sobre la marcha
    const btnLibre = actions.createEl("button", {
      text: "✨  Entrenamiento libre",
      cls: "ln-btn ln-btn-ghost ln-btn-outline ln-btn-libre",
    });
    btnLibre.onclick = () => this.plugin.iniciarSesionLibre();

    const btnSearch = actions.createEl("button", {
      text: "🔍  Buscar ejercicio",
      cls: "ln-btn ln-btn-ghost ln-btn-outline",
    });
    btnSearch.onclick = () => this.plugin.abrirBuscadorEjercicios();

    const btnNew = actions.createEl("button", {
      text: "+  Nueva rutina",
      cls: "ln-btn ln-btn-ghost ln-btn-outline",
    });
    btnNew.onclick = () => this.plugin.crearRutina();

    const btnBd = actions.createEl("button", {
      text: "📚  Base de ejercicios",
      cls: "ln-btn ln-btn-ghost ln-btn-outline",
    });
    btnBd.onclick = () => this.plugin.abrirBdEjercicios();

    const section = root.createDiv({ cls: "ln-section" });
    const secHead = section.createDiv({ cls: "ln-section-head" });
    secHead.createEl("h2", { text: "Tus rutinas", cls: "ln-section-title" });
    const list = section.createDiv({ cls: "ln-lista ln-lista-premium" });

    const rutinas = await this.plugin.listarRutinas();
    if (!rutinas.length) {
      const vacio = list.createDiv({ cls: "ln-vacio" });
      vacio.createEl("p", { text: "Aún no tienes rutinas." });
      const b = vacio.createEl("button", { text: "Crear la primera", cls: "ln-btn ln-btn-primary" });
      b.onclick = () => this.plugin.crearRutina();
    } else {
      secHead.createEl("span", { text: `${rutinas.length}`, cls: "ln-badge" });
      rutinas.forEach((r) => {
        const card = list.createDiv({ cls: "ln-card ln-card-rutina" });

        // Barra de acento lateral
        card.createDiv({ cls: "ln-card-accent" });

        const body = card.createDiv({ cls: "ln-card-rutina-body" });

        // Fila superior: título + badge
        const top = body.createDiv({ cls: "ln-card-rutina-top" });
        const titleRow = top.createDiv({ cls: "ln-card-rutina-title-row" });
        const nombreLimpio = (r.nombre || "").trim();
        titleRow.createEl("div", { text: nombreLimpio.toUpperCase(), cls: "ln-card-rutina-title" });

        // Detectar fuerza / hipertrofia / otro
        const lower = nombreLimpio.toLowerCase();
        let badgeTxt = "";
        if (lower.includes("hipertrofia")) badgeTxt = "HIPERTROFIA";
        else if (lower.includes("fuerza")) badgeTxt = "FUERZA";
        else if (lower.includes("full body") || lower.includes("fullbody")) badgeTxt = "FULL BODY";
        if (badgeTxt) {
          const badge = titleRow.createEl("span", { text: badgeTxt, cls: "ln-card-rutina-badge" });
          if (badgeTxt === "FUERZA") badge.addClass("ln-badge-fuerza");
          else if (badgeTxt === "HIPERTROFIA") badge.addClass("ln-badge-hiper");
        }

        // Fila media: meta + solo basura (a la derecha)
        const mid = body.createDiv({ cls: "ln-card-rutina-mid" });
        const nEj = (r.ejercicios || []).length;
        mid.createEl("div", {
          text: `${nEj} ejercicio${nEj === 1 ? "" : "s"}`,
          cls: "ln-card-rutina-meta",
        });

        const del = mid.createEl("button", {
          cls: "ln-icon-btn ln-icon-danger ln-card-trash",
          attr: { "aria-label": "Borrar" },
        });
        del.innerHTML = "🗑";
        del.onclick = (e) => {
          e.stopPropagation();
          this.plugin.borrarRutina(r);
        };

        // Fila inferior: chips + play + edit
        const bottom = body.createDiv({ cls: "ln-card-rutina-bottom" });
        const chips = bottom.createDiv({ cls: "ln-card-rutina-chips" });
        const dias = ["lunes","martes","miércoles","miercoles","jueves","viernes","sábado","sabado","domingo"];
        const diaMap = {
          lunes: "LUN", martes: "MAR", miércoles: "MIÉ", miercoles: "MIÉ",
          jueves: "JUE", viernes: "VIE", sábado: "SÁB", sabado: "SÁB", domingo: "DOM"
        };
        let diaChip = "";
        for (const d of dias) {
          if (lower.startsWith(d) || lower.includes(d + " ") || lower.includes(d + "—") || lower.includes(d + "-")) {
            diaChip = diaMap[d];
            break;
          }
        }
        if (diaChip) {
          chips.createEl("span", { text: diaChip, cls: "ln-chip ln-chip-day" });
        }
        const grupos = [
          ["pierna", "PIERNA"], ["piernas", "PIERNA"], ["femoral", "FEMORAL"],
          ["pecho", "PECHO"], ["espalda", "ESPALDA"], ["hombro", "HOMBROS"],
          ["hombros", "HOMBROS"], ["tren superior", "TREN SUP."], ["tren inferior", "TREN INF."],
          ["biceps", "BÍCEPS"], ["bíceps", "BÍCEPS"], ["triceps", "TRÍCEPS"], ["tríceps", "TRÍCEPS"],
          ["full body", "FULL BODY"], ["core", "CORE"], ["gluteo", "GLÚTEOS"], ["glúteo", "GLÚTEOS"]
        ];
        for (const [key, label] of grupos) {
          if (lower.includes(key)) {
            chips.createEl("span", { text: label, cls: "ln-chip" });
            break;
          }
        }

        const actions = bottom.createDiv({ cls: "ln-card-rutina-actions" });
        const play = actions.createEl("button", {
          cls: "ln-icon-btn ln-icon-play",
          attr: { "aria-label": "Empezar" },
        });
        play.innerHTML = "▶";
        play.onclick = (e) => {
          e.stopPropagation();
          this.plugin.iniciarSesion(r);
        };
        const edit = actions.createEl("button", {
          cls: "ln-icon-btn ln-icon-muted",
          attr: { "aria-label": "Editar" },
        });
        edit.innerHTML = "✎";
        edit.onclick = (e) => {
          e.stopPropagation();
          this.plugin.editarRutina(r);
        };

        // Tocar la tarjeta también inicia
        card.onclick = (e) => {
          if (e.target.closest("button")) return;
          this.plugin.iniciarSesion(r);
        };
      });
    }
  }

  // ── Calendario ────────────────────────────────────────────────────────────
  async renderCalendario(root) {
    const asignaciones = this.plugin.settings.asignaciones || {};

    // Navegación de mes
    const nav = root.createDiv({ cls: "ln-cal-nav" });
    const prev = nav.createEl("button", { text: "‹", cls: "ln-icon-btn" });
    const title = nav.createEl("div", { cls: "ln-cal-title" });
    const next = nav.createEl("button", { text: "›", cls: "ln-icon-btn" });

    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    title.setText(`${meses[this.calMonth.getMonth()]} ${this.calMonth.getFullYear()}`);

    prev.onclick = () => {
      this.calMonth = new Date(this.calMonth.getFullYear(), this.calMonth.getMonth() - 1, 1);
      this.render();
    };
    next.onclick = () => {
      this.calMonth = new Date(this.calMonth.getFullYear(), this.calMonth.getMonth() + 1, 1);
      this.render();
    };

    // Grid de días
    const grid = root.createDiv({ cls: "ln-cal-grid" });

    // Cabecera días de la semana
    const diasSemana = ["L", "M", "X", "J", "V", "S", "D"];
    diasSemana.forEach((d) => {
      grid.createDiv({ cls: "ln-cal-dow", text: d });
    });

    const year = this.calMonth.getFullYear();
    const month = this.calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    // Lunes = 0
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const hoy = hoyISO();

    // Celdas vacías al inicio
    for (let i = 0; i < startOffset; i++) {
      grid.createDiv({ cls: "ln-cal-day empty" });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const fecha = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const asignado = asignaciones[fecha] || "";
      const tipoEsp = tipoDiaEspecial(asignado);

      let cls = "ln-cal-day";
      if (fecha === hoy) cls += " today";
      if (asignado) cls += " has-data";
      if (tipoEsp === "descanso") cls += " rest-day";
      if (tipoEsp === "enfermo") cls += " sick-day";

      const cell = grid.createDiv({ cls });
      
      cell.createDiv({ cls: "ln-cal-num", text: String(day) });

      if (asignado) {
        const label = cell.createDiv({ cls: "ln-cal-routine" + (tipoEsp ? " ln-cal-special" : "") });
        label.setText(asignado);
      }

      // Toque → comportamiento según si es pasado / hoy / futuro
      cell.onclick = async () => {
        const sesiones = await this.plugin.obtenerSesionesPorFecha(fecha);
        const esPasado = fecha < hoy;
        const esEspecial = !!tipoDiaEspecial(asignado);

        if (sesiones.length > 0) {
          // Ya hay registro → verlo (y poder agregar otro si es pasado)
          new VerHistorialDiaModal(this.app, this.plugin, fecha, sesiones, esPasado).open();
        } else if (esPasado && !esEspecial) {
          // Día pasado sin registro de entrenamiento → menú para migrar datos
          // (si es descanso/enfermo solo se asigna, no se abre el form de series)
          new AgregarHistorialModal(this.app, this.plugin, fecha, () => this.render()).open();
        } else {
          // Hoy, futuro, o especial sin archivo → asignar / editar nombre
          new AsignarRutinaModal(this.app, this.plugin, fecha, asignado, () => this.render()).open();
        }
      };
    }

    // Ayuda
    const help = root.createDiv({ cls: "ln-cal-help" });
    help.createEl("p", {
      text: "Días pasados: toca para agregar o ver entrenamientos. Hoy y futuros: toca para planificar la rutina.",
      cls: "ln-muted",
    });
  }

  // ── Progresión ────────────────────────────────────────────────────────────
  async renderProgresion(root) {
    const section = root.createDiv({ cls: "ln-section" });
    section.createEl("h2", { text: "Progresión", cls: "ln-section-title" });
    section.createEl("p", {
      text: "Peso máximo por ejercicio y mes (se actualiza con tus sesiones).",
      cls: "ln-muted",
    });

    const data = await this.plugin.calcularProgresionEjercicios();
    const { ejercicios, meses, unidad } = data;

    if (!ejercicios.length || !meses.length) {
      const vacio = section.createDiv({ cls: "ln-vacio" });
      vacio.createEl("p", { text: "Aún no hay datos de progresión." });
      vacio.createEl("p", {
        text: "Completa entrenamientos y registra peso × reps. Aquí verás una tabla por mes.",
        cls: "ln-muted",
      });
      return;
    }

    // Tabla horizontal scrollable (estilo móvil)
    const wrap = section.createDiv({ cls: "ln-prog-wrap" });
    const table = wrap.createEl("table", { cls: "ln-prog-table" });

    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    hr.createEl("th", { text: "Ejercicio", cls: "ln-prog-sticky" });
    meses.forEach((m) => {
      hr.createEl("th", { text: m.label });
    });

    const tbody = table.createEl("tbody");
    ejercicios.forEach((ej, idx) => {
      const tr = tbody.createEl("tr", { cls: idx % 2 === 0 ? "even" : "odd" });
      const nameTd = tr.createEl("td", { cls: "ln-prog-sticky ln-prog-name" });
      const nameSpan = nameTd.createEl("span", { cls: "ln-prog-name-text", text: ej.nombre });
      meses.forEach((m) => {
        const cell = ej.porMes[m.key];
        const td = tr.createEl("td", { cls: "ln-prog-val" });
        if (!cell) {
          td.createEl("span", { text: "—", cls: "ln-prog-empty" });
        } else if (cell.min !== cell.max) {
          const stack = td.createEl("span", { cls: "ln-prog-stack ln-prog-up" });
          stack.createEl("span", { text: `${cell.min} → ${cell.max}`, cls: "ln-prog-range" });
          if (unidad) stack.createEl("span", { text: unidad, cls: "ln-prog-unit" });
        } else {
          const stack = td.createEl("span", { cls: "ln-prog-stack" });
          stack.createEl("span", { text: String(cell.max), cls: "ln-prog-single" });
          if (unidad) stack.createEl("span", { text: unidad, cls: "ln-prog-unit" });
        }
      });
    });
  }

  // ── Temporizador premium ──────────────────────────────────────────────────
  /** Sincroniza el temporizador de la pestaña Tiempo con el reloj real (background-safe). */
  _syncTimerFromEndAt(opts = {}) {
    const silent = !!opts.silent;
    if (!this.timerEndAt) return;
    const left = Math.max(0, Math.round((this.timerEndAt - Date.now()) / 1000));
    this.timerLeft = left;
    if (left <= 0) {
      this.timerLeft = 0;
      this.timerRunning = false;
      this.timerEndAt = 0;
      if (this._timerInterval) {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
      }
      if (!silent && !this._timerFinishNotified) {
        this._timerFinishNotified = true;
        try {
          lnSpeakTimeFinish();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        } catch (_) {}
        try { new Notice("⏰ Tiempo finalizado"); } catch (_) {}
        try {
          lnNotify("⏰ Tiempo finalizado", "El temporizador de Liftnote ha terminado", {
            tag: "liftnote-timer-done",
            requireInteraction: true,
          });
        } catch (_) {}
      }
    }
  }

  _ensureTimerInterval() {
    if (this._timerInterval) return;
    if (!this.timerRunning || !this.timerEndAt) return;
    this._timerLastSpoken = -1;
    this._timerInterval = setInterval(() => {
      if (!this.timerRunning) return;
      this._syncTimerFromEndAt();
      if (this.timerLeft > 0 && (this.timerLeft === 10 || (this.timerLeft >= 1 && this.timerLeft <= 5))) {
        if (this.timerLeft !== this._timerLastSpoken) {
          this._timerLastSpoken = this.timerLeft;
          try { lnSpeakCountdown(this.timerLeft); } catch (_) {}
        }
      }
      if (typeof this._timerUpdateUI === "function") this._timerUpdateUI();
    }, 250);
  }

  _bindTimerVisibility() {
    if (this._timerVisHandler) return;
    this._timerVisHandler = () => {
      // Al volver de segundo plano o de otra app: recalcular siempre
      if (this.timerEndAt) {
        this._syncTimerFromEndAt();
        this._ensureTimerInterval();
        if (typeof this._timerUpdateUI === "function") this._timerUpdateUI();
        // Si estamos en la pestaña timer y el DOM se quedó desfasado, forzar re-render
        if (this.tab === "timer" && document.visibilityState === "visible") {
          // updateUI ya actualiza; si no hay callback (tab recreada), el próximo render lo arregla
        }
      }
    };
    document.addEventListener("visibilitychange", this._timerVisHandler);
    window.addEventListener("pageshow", this._timerVisHandler);
    window.addEventListener("focus", this._timerVisHandler);
  }

  renderTemporizador(root) {
    this._bindTimerVisibility();

    // CRÍTICO: al entrar a la pestaña, sincronizar con el tiempo real
    // (por si el interval estuvo pausado por iOS o cambiamos de pestaña)
    if (this.timerEndAt || this.timerRunning) {
      const wasRunning = this.timerRunning;
      this._syncTimerFromEndAt({ silent: true });
      // Si acabamos de descubrir que terminó mientras estábamos fuera
      if (wasRunning && !this.timerRunning && this.timerLeft === 0 && !this._timerFinishNotified) {
        this._timerFinishNotified = true;
        this._timerWasRunning = false;
        try {
          lnSpeakTimeFinish();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        } catch (_) {}
        try { new Notice("⏰ Tiempo finalizado"); } catch (_) {}
      }
    }

    const box = root.createDiv({ cls: "ln-timer" });

    const head = box.createDiv({ cls: "ln-timer-head" });
    head.createEl("div", { text: "Temporizador", cls: "ln-timer-title" });
    head.createEl("div", { text: "Ejercicios por tiempo", cls: "ln-timer-sub" });

    const ringWrap = box.createDiv({ cls: "ln-timer-ring-wrap" });
    const barWrap = ringWrap.createDiv({ cls: "ln-timer-bar-wrap" });
    const barTrack = barWrap.createDiv({ cls: "ln-timer-bar-track" });
    const barProgress = barTrack.createDiv({ cls: "ln-timer-bar-progress" });
    const timeEl = ringWrap.createDiv({ cls: "ln-timer-time" });
    const statusEl = box.createDiv({ cls: "ln-timer-status" });

    const format = (sec) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    };

    const updateUI = () => {
      // Siempre resincronizar antes de pintar (por si el interval no corrió)
      if (this.timerEndAt && this.timerRunning) {
        this._syncTimerFromEndAt({ silent: true });
      }
      const left = Math.max(0, Math.floor(this.timerLeft));
      const total = Math.max(1, this.timerTotal);
      const pct = left / total;

      barProgress.style.width = `${pct * 100}%`;

      if (left <= 5 && left >= 1 && this.timerRunning) {
        timeEl.setText(String(left));
        timeEl.classList.add("ln-timer-countdown");
        ringWrap.classList.add("countdown");
      } else {
        timeEl.setText(format(this.timerLeft));
        timeEl.classList.remove("ln-timer-countdown");
        ringWrap.classList.remove("countdown");
      }

      if (this.timerRunning) {
        statusEl.setText("EN CURSO");
        statusEl.className = "ln-timer-status on";
        ringWrap.classList.add("running");
      } else if (this._timerFinishNotified && this.timerLeft === 0) {
        statusEl.setText("FINALIZADO");
        statusEl.className = "ln-timer-status done";
        ringWrap.classList.remove("running");
        ringWrap.classList.remove("countdown");
        timeEl.classList.remove("ln-timer-countdown");
      } else if (this.timerLeft < this.timerTotal) {
        statusEl.setText("PAUSADO");
        statusEl.className = "ln-timer-status paused";
        ringWrap.classList.remove("running");
      } else {
        statusEl.setText("LISTO PARA EMPEZAR");
        statusEl.className = "ln-timer-status";
        ringWrap.classList.remove("running");
      }
    };

    // Guardar callback actual para el interval y visibility
    this._timerUpdateUI = updateUI;

    const clearTick = () => {
      if (this._timerInterval) {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
      }
    };

    const start = () => {
      try {
        lnGetAudio();
        if (window.speechSynthesis) {
          window.speechSynthesis.getVoices();
          const warm = new SpeechSynthesisUtterance("");
          warm.volume = 0;
          window.speechSynthesis.speak(warm);
          window.speechSynthesis.cancel();
        }
      } catch (_) {}
      if (this.timerLeft <= 0) this.timerLeft = this.timerTotal;
      this.timerRunning = true;
      this._timerWasRunning = true;
      this._timerFinishNotified = false;
      this.timerEndAt = Date.now() + this.timerLeft * 1000;
      this._timerLastSpoken = -1;
      clearTick();
      this._ensureTimerInterval();
      updateUI();
    };

    const pause = () => {
      if (this.timerEndAt) {
        this.timerLeft = Math.max(0, Math.round((this.timerEndAt - Date.now()) / 1000));
      }
      this.timerRunning = false;
      this.timerEndAt = 0;
      clearTick();
      updateUI();
    };

    const reset = () => {
      this.timerRunning = false;
      this.timerEndAt = 0;
      this._timerFinishNotified = false;
      this._timerWasRunning = false;
      clearTick();
      this.timerLeft = this.timerTotal;
      updateUI();
    };

    const setDuration = (sec) => {
      this.timerTotal = sec;
      this.timerLeft = sec;
      this.timerRunning = false;
      this.timerEndAt = 0;
      this._timerFinishNotified = false;
      this._timerWasRunning = false;
      clearTick();
      updateUI();
      box.querySelectorAll(".ln-timer-chip").forEach((ch) => {
        ch.classList.toggle("active", parseInt(ch.dataset.sec, 10) === sec);
      });
    };

    const presets = box.createDiv({ cls: "ln-timer-presets" });
    presets.createEl("div", { text: "RÁPIDOS", cls: "ln-timer-label" });
    const chips = presets.createDiv({ cls: "ln-timer-chips" });
    [30, 60, 90, 120, 180, 300].forEach((sec) => {
      const label = sec < 60 ? `${sec}s` : `${sec / 60}:00`;
      const chip = chips.createEl("button", {
        text: label,
        cls: "ln-timer-chip" + (this.timerTotal === sec ? " active" : ""),
      });
      chip.dataset.sec = String(sec);
      chip.onclick = () => setDuration(sec);
    });

    const fine = box.createDiv({ cls: "ln-timer-fine" });
    const minus = fine.createEl("button", { text: "−15 s", cls: "ln-btn ln-btn-ghost" });
    const plus = fine.createEl("button", { text: "+15 s", cls: "ln-btn ln-btn-ghost" });

    const adjustTime = (delta) => {
      if (this.timerRunning) {
        if (!this.timerEndAt) this.timerEndAt = Date.now() + this.timerLeft * 1000;
        this.timerEndAt += delta * 1000;
        const minEnd = Date.now() + 1000;
        if (this.timerEndAt < minEnd) this.timerEndAt = minEnd;
        this._syncTimerFromEndAt({ silent: true });
        this.timerTotal = Math.min(1800, Math.max(15, Math.max(this.timerLeft, this.timerTotal + delta)));
        updateUI();
        box.querySelectorAll(".ln-timer-chip").forEach((ch) => {
          ch.classList.toggle("active", parseInt(ch.dataset.sec, 10) === this.timerTotal);
        });
      } else {
        const next = Math.max(15, Math.min(1800, this.timerTotal + delta));
        setDuration(next);
      }
    };

    minus.onclick = () => adjustTime(-15);
    plus.onclick = () => adjustTime(15);

    const controls = box.createDiv({ cls: "ln-timer-controls" });
    const btnMain = controls.createEl("button", {
      text: this.timerRunning ? "Pausar" : "Empezar",
      cls: "ln-btn ln-btn-primary ln-btn-lg ln-timer-main",
    });
    const btnReset = controls.createEl("button", { text: "Reiniciar", cls: "ln-btn ln-btn-ghost" });

    btnMain.onclick = () => {
      if (this.timerRunning) {
        pause();
        btnMain.setText("Empezar");
      } else {
        start();
        btnMain.setText("Pausar");
      }
    };
    btnReset.onclick = () => {
      reset();
      btnMain.setText("Empezar");
    };

    // Si sigue corriendo al volver a la pestaña: asegurar interval + UI al día
    if (this.timerRunning && this.timerEndAt) {
      this._ensureTimerInterval();
      btnMain.setText("Pausar");
    } else if (this.timerLeft === 0 && this._timerFinishNotified) {
      btnMain.setText("Empezar");
    }

    updateUI();
  }
}

// ── Modal para asignar nombre de rutina a un día ────────────────────────────
class AsignarRutinaModal extends Modal {
  constructor(app, plugin, fecha, valorActual, onSave) {
    super(app);
    this.plugin = plugin;
    this.fecha = fecha;
    this.valorActual = valorActual || "";
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    const guardarNombre = async (nombre) => {
      if (!this.plugin.settings.asignaciones) this.plugin.settings.asignaciones = {};
      if (nombre) {
        this.plugin.settings.asignaciones[this.fecha] = nombre;
        // Si es descanso o enfermo → crear entrada en el historial automáticamente
        const tipo = tipoDiaEspecial(nombre);
        if (tipo) {
          await this.plugin.guardarDiaEspecial(this.fecha, nombre, tipo);
        }
      } else {
        delete this.plugin.settings.asignaciones[this.fecha];
      }
      await this.plugin.saveSettings();
      new Notice(nombre ? `Asignado: ${nombre}` : "Eliminado");
      this.close();
      if (this.onSave) this.onSave();
    };

    // Botones ARRIBA (no los tapa el teclado del iPhone)
    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar", cls: "ln-btn ln-btn-primary" });

    // Contenedor scrollable
    const body = contentEl.createDiv({ cls: "ln-form-body" });

    body.createEl("h2", { text: "Rutina del día" });
    body.createEl("p", { text: this.fecha, cls: "ln-muted" });

    // Sugerencias desde settings (editables)
    const headerRow = body.createDiv({ cls: "ln-opciones-header" });
    headerRow.createEl("p", { text: "Elige una opción:", cls: "ln-muted", attr: { style: "margin: 12px 0 8px; font-size: 0.85em;" } });
    const editBtn = headerRow.createEl("button", { text: "Editar opciones", cls: "ln-btn-link" });
    editBtn.onclick = () => {
      new EditarOpcionesModal(this.app, this.plugin, () => {
        // Reabrir este modal para refrescar chips
        const fecha = this.fecha;
        const valor = this.valorActual;
        const onSave = this.onSave;
        this.close();
        setTimeout(() => {
          new AsignarRutinaModal(this.app, this.plugin, fecha, valor, onSave).open();
        }, 100);
      }).open();
    };

    const sugerencias = body.createDiv({ cls: "ln-sugerencias" });
    const ejemplos = (this.plugin.settings.opcionesRapidas && this.plugin.settings.opcionesRapidas.length)
      ? this.plugin.settings.opcionesRapidas
      : ["Descanso"];

    ejemplos.forEach((ej) => {
      const chip = sugerencias.createEl("button", { text: ej, cls: "ln-chip" });
      chip.onclick = () => guardarNombre(ej);
    });

    // Input opcional (sin autofocus)
    body.createEl("p", { text: "O escribe uno personalizado:", cls: "ln-muted", attr: { style: "margin: 16px 0 4px; font-size: 0.85em;" } });
    const input = body.createEl("input", {
      type: "text",
      cls: "ln-input ln-input-lg",
      value: this.valorActual,
      attr: { placeholder: "Ej. Pecho y tríceps" },
    });
    input.addEventListener("focus", () => {
      setTimeout(() => {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    });

    save.onclick = () => guardarNombre(input.value.trim());

    // Borrar (si ya había algo) — elimina asignación + archivos de historial del día
    if (this.valorActual) {
      const del = body.createEl("button", { text: "Eliminar registro del día", cls: "ln-btn ln-btn-danger ln-btn-sm" });
      del.style.marginTop = "12px";
      del.onclick = async () => {
        const ok = await this.plugin.borrarRegistroDia(this.fecha, true);
        if (ok) {
          this.close();
          if (this.onSave) this.onSave();
        }
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal para editar opciones rápidas del calendario ───────────────────────
class EditarOpcionesModal extends Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.lista = [...(plugin.settings.opcionesRapidas || [])];
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar", cls: "ln-btn ln-btn-primary" });
    save.onclick = async () => {
      const limpia = this.lista.map((s) => s.trim()).filter(Boolean);
      this.plugin.settings.opcionesRapidas = limpia;
      await this.plugin.saveSettings();
      new Notice("Opciones actualizadas");
      this.close();
      if (this.onDone) this.onDone();
    };

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    body.createEl("h2", { text: "Editar opciones" });
    body.createEl("p", { text: "Agrega, cambia o quita las opciones rápidas del calendario.", cls: "ln-muted" });

    const list = body.createDiv({ cls: "ln-opciones-lista" });

    const renderLista = () => {
      list.empty();
      this.lista.forEach((item, i) => {
        const row = list.createDiv({ cls: "ln-opcion-row" });
        const input = row.createEl("input", {
          type: "text",
          cls: "ln-input",
          value: item,
          attr: { placeholder: "Nombre de la opción" },
        });
        input.oninput = () => { this.lista[i] = input.value; };
        const del = row.createEl("button", { text: "✕", cls: "ln-icon-btn ln-icon-danger" });
        del.onclick = () => {
          this.lista.splice(i, 1);
          renderLista();
        };
      });
    };
    renderLista();

    const add = body.createEl("button", { text: "+ Agregar opción", cls: "ln-btn ln-btn-ghost" });
    add.style.marginTop = "12px";
    add.onclick = () => {
      this.lista.push("");
      renderLista();
      // focus último input
      const inputs = list.querySelectorAll("input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Base de datos de nombres de ejercicios ─────────────────────────────────
class BdEjerciciosModal extends Modal {
  constructor(app, plugin, onDone) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.lista = (plugin.settings.bdEjercicios || []).map((item) => lnNormEj(item));
    this.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cerrar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar", cls: "ln-btn ln-btn-primary" });
    save.onclick = async () => {
      await this._guardar();
      new Notice("Base de ejercicios guardada");
      this.close();
      if (this.onDone) this.onDone();
    };

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    body.createEl("div", { text: "EJERCICIOS", cls: "ln-bd-header" });

    // Search + Add
    const searchRow = body.createDiv({ cls: "ln-bd-search-row" });
    const searchIn = searchRow.createEl("input", {
      type: "search",
      cls: "ln-input",
      attr: { placeholder: "Buscar ejercicios…", enterkeyhint: "search" },
    });
    const addBtn = searchRow.createEl("button", { cls: "ln-bd-add-btn" });
    addBtn.innerHTML = `<span style="font-size:1.15em;line-height:1">+</span> EJERCICIO`;

    let filtro = "";

    /** Abre el formulario de alta/edición de ejercicio (nombre + grupo). */
    const abrirFormEjercicio = (idxExistente) => {
      const esEdicion = idxExistente != null && idxExistente >= 0;
      const actual = esEdicion
        ? this.lista[idxExistente]
        : {
            nombre: (searchIn.value || "").trim(),
            grupo: "",
            icon: "",
          };
      let iconSel = actual.icon || lnInferirIcono(actual.nombre, actual.grupo);

      // Overlay simple dentro del modal
      let overlay = body.querySelector(".ln-bd-form-overlay");
      if (overlay) overlay.remove();
      overlay = body.createDiv({ cls: "ln-bd-form-overlay" });
      overlay.style.cssText =
        "position:absolute;inset:0;background:var(--background-primary);z-index:20;display:flex;flex-direction:column;padding:16px;overflow:auto;";

      const formTitle = overlay.createEl("div", {
        text: esEdicion ? "Editar ejercicio" : "Nuevo ejercicio",
        cls: "ln-bd-header",
      });
      formTitle.style.marginBottom = "12px";

      overlay.createEl("label", { text: "Nombre", cls: "ln-label" });
      const nameInput = overlay.createEl("input", {
        type: "text",
        cls: "ln-input",
        value: actual.nombre || "",
        attr: { placeholder: "Ej: Press de banca", enterkeyhint: "next" },
      });
      nameInput.style.marginBottom = "14px";

      overlay.createEl("label", { text: "Grupo muscular", cls: "ln-label" });
      const select = overlay.createEl("select", { cls: "ln-input ln-bd-grupo-select" });
      select.style.cssText = "margin-bottom:14px;width:100%;appearance:auto;";
      const optVacio = select.createEl("option", { text: "— Sin grupo —", value: "" });
      GRUPOS_MUSCULARES.forEach((g) => {
        const o = select.createEl("option", { text: g, value: g });
        if (actual.grupo === g) o.selected = true;
      });
      if (actual.grupo && !GRUPOS_MUSCULARES.includes(actual.grupo)) {
        optVacio.selected = true;
      }

      // Selector de miniatura (offline)
      overlay.createEl("label", { text: "Miniatura", cls: "ln-label" });
      const iconGrid = overlay.createDiv({ cls: "ln-bd-icon-grid" });
      const renderIconGrid = () => {
        iconGrid.empty();
        LN_EJ_ICON_KEYS.forEach((key) => {
          const btn = iconGrid.createEl("button", {
            cls: "ln-bd-icon-btn" + (iconSel === key ? " on" : ""),
            attr: { type: "button", "aria-label": LN_EJ_ICONS[key].label, title: LN_EJ_ICONS[key].label },
          });
          btn.innerHTML = lnIconSvg(key);
          btn.onclick = (e) => {
            e.preventDefault();
            iconSel = key;
            renderIconGrid();
          };
        });
      };
      renderIconGrid();

      // Al cambiar grupo, si el icono es genérico o de otro grupo, sugerir el del grupo
      select.onchange = () => {
        const g = select.value || "";
        const sug = g ? lnGrupoToIconKey(g) : lnInferirIcono(nameInput.value, g);
        if (!iconSel || iconSel === "generico" || Object.values({
          abdomen:1, pecho:1, espalda:1, biceps:1, triceps:1, piernas:1, hombros:1, trapecios:1
        }).length) {
          // solo auto-cambiar si el actual es de grupo muscular o vacío
          const grupoKeys = ["abdomen","pecho","espalda","biceps","triceps","piernas","hombros","trapecios","generico",""];
          if (grupoKeys.includes(iconSel) || !iconSel) {
            iconSel = sug;
            renderIconGrid();
          }
        }
      };

      const formActs = overlay.createDiv({ cls: "ln-form-actions" });
      formActs.style.marginTop = "auto";
      const btnCancel = formActs.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
      const btnOk = formActs.createEl("button", {
        text: esEdicion ? "Guardar" : "Añadir",
        cls: "ln-btn ln-btn-primary",
      });

      const cerrarForm = () => {
        overlay.remove();
      };
      btnCancel.onclick = cerrarForm;

      btnOk.onclick = () => {
        const nombre = (nameInput.value || "").trim();
        if (!nombre) {
          new Notice("Escribe el nombre del ejercicio");
          nameInput.focus();
          return;
        }
        const grupo = select.value || "";
        const icon = iconSel || lnInferirIcono(nombre, grupo);
        const dup = this.lista.some(
          (x, idx) =>
            (!esEdicion || idx !== idxExistente) &&
            x.nombre.toLowerCase() === nombre.toLowerCase()
        );
        if (dup) {
          new Notice("Ya está en la lista");
          return;
        }
        if (esEdicion) {
          this.lista[idxExistente] = { nombre, grupo, icon };
        } else {
          this.lista.push({
            nombre,
            grupo: grupo || lnInferirGrupo(nombre),
            icon: icon || lnInferirIcono(nombre, grupo),
          });
        }
        this.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        searchIn.value = "";
        filtro = "";
        cerrarForm();
        renderLista();
        this._guardar();
      };

      setTimeout(() => {
        nameInput.focus();
        nameInput.select();
      }, 40);
    };

    addBtn.onclick = () => abrirFormEjercicio(null);
    searchIn.addEventListener("input", () => {
      filtro = (searchIn.value || "").trim().toLowerCase();
      renderLista();
    });
    searchIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const n = (searchIn.value || "").trim();
        if (n) abrirFormEjercicio(null);
      }
    });

    // Importar del historial
    const importRow = body.createDiv({ cls: "ln-bd-import-row" });
    const importBtn = importRow.createEl("button", {
      text: "Importar del historial",
      cls: "ln-btn ln-btn-ghost ln-btn-block",
    });
    importBtn.onclick = async () => {
      try {
        const data = await this.plugin.indexarEjerciciosHistorial();
        let añadidos = 0;
        (data.ejercicios || []).forEach((e) => {
          const nombre = (e.nombre || "").trim();
          if (!nombre) return;
          if (this.lista.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) return;
          const grupo = lnInferirGrupo(nombre);
          this.lista.push({ nombre, grupo, icon: lnInferirIcono(nombre, grupo) });
          añadidos++;
        });
        // También de rutinas
        try {
          const rutinas = await this.plugin.listarRutinas();
          for (const r of rutinas) {
            (r.ejercicios || []).forEach((ej) => {
              const nombre = (ej.nombre || "").trim();
              if (!nombre) return;
              if (this.lista.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) return;
              const grupo = lnInferirGrupo(nombre);
              this.lista.push({ nombre, grupo, icon: lnInferirIcono(nombre, grupo) });
              añadidos++;
            });
          }
        } catch (_) {}
        this.lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        renderLista();
        await this._guardar();
        new Notice(añadidos ? `Se añadieron ${añadidos} ejercicio${añadidos === 1 ? "" : "s"}` : "Nada nuevo que importar");
      } catch (err) {
        new Notice("No se pudo importar del historial");
      }
    };

    const countEl = body.createEl("div", { cls: "ln-bd-count" });
    const list = body.createDiv({ cls: "ln-bd-list" });
    // Para que el overlay se posicione bien
    body.style.position = "relative";

    const svgEdit =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const svgTrash =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';

    const renderLista = () => {
      list.empty();
      const visibles = filtro
        ? this.lista.filter(
            (x) =>
              x.nombre.toLowerCase().includes(filtro) ||
              (x.grupo || "").toLowerCase().includes(filtro)
          )
        : this.lista;
      countEl.setText(
        filtro
          ? `${visibles.length} de ${this.lista.length} ejercicio${this.lista.length === 1 ? "" : "s"}`
          : `${this.lista.length} ejercicio${this.lista.length === 1 ? "" : "s"}`
      );
      if (!this.lista.length) {
        list.createEl("div", {
          text: "Aún vacío. Escribe un nombre arriba o importa del historial.",
          cls: "ln-bd-empty",
        });
        return;
      }
      if (!visibles.length) {
        list.createEl("div", {
          text: "Ningún ejercicio coincide con la búsqueda.",
          cls: "ln-bd-empty",
        });
        return;
      }
      visibles.forEach((item, visIdx) => {
        const i = this.lista.indexOf(item);
        const row = list.createDiv({ cls: "ln-bd-item" });
        row.createEl("span", {
          text: String(visIdx + 1).padStart(2, "0"),
          cls: "ln-bd-num",
        });
        // Miniatura offline
        const thumb = row.createDiv({ cls: "ln-bd-thumb" });
        thumb.innerHTML = lnIconSvg(item.icon || lnInferirIcono(item.nombre, item.grupo));
        const info = row.createDiv({ cls: "ln-bd-info" });
        info.createEl("div", { text: item.nombre.toUpperCase(), cls: "ln-bd-name" });
        const metaText = item.grupo ? item.grupo : "—";
        info.createEl("div", { text: metaText, cls: "ln-bd-meta" });

        const acts = row.createDiv({ cls: "ln-bd-actions" });
        const editBtn = acts.createEl("button", {
          cls: "ln-icon-btn",
          attr: { "aria-label": "Editar" },
        });
        editBtn.innerHTML = svgEdit;
        const delBtn = acts.createEl("button", {
          cls: "ln-icon-btn ln-icon-danger",
          attr: { "aria-label": "Eliminar" },
        });
        delBtn.innerHTML = svgTrash;

        editBtn.onclick = (e) => {
          e.stopPropagation();
          abrirFormEjercicio(i);
        };
        delBtn.onclick = (e) => {
          e.stopPropagation();
          this.lista.splice(i, 1);
          renderLista();
          this._guardar();
        };
      });
    };
    renderLista();
  }

  async _guardar() {
    const limpia = [];
    const seen = new Set();
    this.lista.forEach((item) => {
      const nombre = (item.nombre || "").trim();
      if (!nombre) return;
      const key = nombre.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      limpia.push({
        nombre,
        grupo: (item.grupo || "").trim(),
        icon: (item.icon || lnInferirIcono(nombre, item.grupo || "")).trim(),
      });
    });
    limpia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    this.lista = limpia;
    this.plugin.settings.bdEjercicios = limpia;
    await this.plugin.saveSettings();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ElegirEjercicioModal extends Modal {
  constructor(app, plugin, onPick) {
    super(app);
    this.plugin = plugin;
    this.onPick = onPick;
    this.filtro = "";
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cerrar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    body.createEl("h2", { text: "Elegir ejercicio" });

    const search = body.createEl("input", {
      type: "search",
      cls: "ln-input",
      attr: { placeholder: "Buscar…", enterkeyhint: "search" },
    });
    search.oninput = () => {
      this.filtro = search.value;
      render();
    };

    const list = body.createDiv({ cls: "ln-bd-pick-list" });
    const render = () => {
      list.empty();
      const bd = this.plugin.settings.bdEjercicios || [];
      const q = (this.filtro || "").trim().toLowerCase();
      const items = q
        ? bd.filter((item) => lnNombreEj(item).toLowerCase().includes(q))
        : bd;
      if (!bd.length) {
        list.createEl("p", {
          text: "La base está vacía. Añade nombres en «Base de ejercicios».",
          cls: "ln-muted",
        });
        return;
      }
      if (!items.length) {
        list.createEl("p", { text: "Sin coincidencias", cls: "ln-muted" });
        return;
      }
      items.forEach((item) => {
        const nombre = lnNombreEj(item);
        const btn = list.createEl("button", { text: nombre, cls: "ln-bd-pick-item" });
        btn.onclick = () => {
          if (this.onPick) this.onPick(nombre);
          this.close();
        };
      });
    };
    render();
    setTimeout(() => search.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal premium para agregar historial de días pasados ───────────────────
class AgregarHistorialModal extends Modal {
  constructor(app, plugin, fecha, onSave) {
    super(app);
    this.plugin = plugin;
    this.fecha = fecha;
    this.onSave = onSave;
    this.unidad = lnNormUnidad(plugin.settings.unidadPeso || "kg");
    this.rutinaNombre = "";
    this.duracionMin = "";
    this.ejercicios = [
      { nombre: "", series: [{ peso: "", reps: "" }, { peso: "", reps: "" }, { peso: "", reps: "" }] }
    ];
    this.nombresEjercicios = []; // lista de historial + rutinas
    this._sugerenciasEl = null;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    modalEl.addClass("ln-agregar-hist-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    // Cargar nombres de ejercicios del historial y rutinas
    await this.cargarNombresEjercicios();

    // Fecha legible
    const [y, m, d] = this.fecha.split("-");
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const fechaTxt = `${parseInt(d, 10)} de ${meses[parseInt(m, 10) - 1]} ${y}`;

    // Acciones arriba (iPhone-friendly)
    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar", cls: "ln-btn ln-btn-primary" });
    save.onclick = () => this.guardar();

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    this.bodyEl = body;

    // Header premium
    const header = body.createDiv({ cls: "ln-agregar-header" });
    header.createEl("div", { text: "Agregar entrenamiento", cls: "ln-agregar-title" });
    header.createEl("div", { text: fechaTxt, cls: "ln-agregar-fecha" });
    header.createEl("p", {
      text: "Ideal para migrar entrenamientos que ya tenías. Rápido y sencillo.",
      cls: "ln-muted ln-agregar-sub"
    });

    // Nombre de rutina
    body.createEl("label", { text: "Nombre de la rutina", cls: "ln-label" });
    const inputRutina = body.createEl("input", {
      type: "text",
      cls: "ln-input ln-input-lg",
      attr: { placeholder: "Ej. Pecho + Tríceps, Espalda + Bíceps…", enterkeyhint: "done" },
      value: this.rutinaNombre,
    });
    inputRutina.oninput = () => { this.rutinaNombre = inputRutina.value; };
    this._bindEnterBlur(inputRutina);

    // Chips rápidos (incluye descanso / enfermo para días pasados)
    const chips = body.createDiv({ cls: "ln-sugerencias" });
    let opciones = [...(this.plugin.settings.opcionesRapidas || [])].filter(Boolean);
    // Asegurar que siempre haya opciones de descanso si no están
    const tieneDescanso = opciones.some((o) => tipoDiaEspecial(o) === "descanso");
    const tieneEnfermo = opciones.some((o) => tipoDiaEspecial(o) === "enfermo");
    if (!tieneDescanso) opciones.push("😴");
    if (!tieneEnfermo) opciones.push("Enfermo");
    opciones.forEach((op) => {
      const chip = chips.createEl("button", { text: op, cls: "ln-chip" });
      chip.onclick = () => {
        this.rutinaNombre = op;
        inputRutina.value = op;
        inputRutina.blur();
      };
    });

    // Duración opcional
    const durRow = body.createDiv({ cls: "ln-agregar-dur" });
    durRow.createEl("label", { text: "Duración (min)", cls: "ln-label" });
    const inputDur = durRow.createEl("input", {
      type: "number",
      cls: "ln-input",
      attr: { placeholder: "Opcional", min: "1", inputmode: "numeric", enterkeyhint: "done" },
      value: this.duracionMin,
    });
    inputDur.oninput = () => { this.duracionMin = inputDur.value; };
    this._bindEnterBlur(inputDur);

    // Ejercicios
    body.createEl("label", { text: "Ejercicios", cls: "ln-label", attr: { style: "margin-top: 18px;" } });
    this.ejsContainer = body.createDiv({ cls: "ln-agregar-ejs" });
    this.renderEjercicios();

    const addEj = body.createEl("button", { text: "+ Agregar ejercicio", cls: "ln-btn ln-btn-ghost ln-btn-block" });
    addEj.style.marginTop = "10px";
    addEj.onclick = () => {
      this.ocultarSugerencias();
      this.ejercicios.push({
        nombre: "",
        series: [{ peso: "", reps: "" }, { peso: "", reps: "" }, { peso: "", reps: "" }]
      });
      this.renderEjercicios();
    };

    // Cerrar sugerencias al tocar fuera
    contentEl.addEventListener("click", (e) => {
      if (!e.target.closest(".ln-agregar-ej-top") && !e.target.closest(".ln-sugerencias-drop")) {
        this.ocultarSugerencias();
      }
    });
  }

  async cargarNombresEjercicios() {
    const set = new Set();
    (this.plugin.settings.bdEjercicios || []).forEach((item) => {
      const n = lnNombreEj(item);
      if (n) set.add(n);
    });
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      (data.ejercicios || []).forEach((e) => {
        if (e.nombre) set.add(e.nombre.trim());
      });
    } catch (_) {}
    try {
      const rutinas = await this.plugin.listarRutinas();
      for (const r of rutinas) {
        (r.ejercicios || []).forEach((ej) => {
          if (ej.nombre) set.add(ej.nombre.trim());
        });
      }
    } catch (_) {}
    this.nombresEjercicios = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  _bindEnterBlur(input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        this.ocultarSugerencias();
      }
    });
  }

  ocultarSugerencias() {
    if (this._sugerenciasEl) {
      this._sugerenciasEl.remove();
      this._sugerenciasEl = null;
    }
  }

  mostrarSugerencias(input, ej, filtro) {
    this.ocultarSugerencias();
    const q = (filtro || "").trim().toLowerCase();
    let lista = this.nombresEjercicios;
    if (q) {
      lista = lista.filter((n) => n.toLowerCase().includes(q));
    }
    // Máximo 8
    lista = lista.slice(0, 8);

    const drop = document.createElement("div");
    drop.className = "ln-sugerencias-drop";

    if (lista.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ln-sugerencias-empty";
      empty.textContent = q
        ? "No hay coincidencias · escribe uno nuevo"
        : "Aún no hay ejercicios en tu historial · escribe el nombre";
      drop.appendChild(empty);
    } else {
      lista.forEach((nombre) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ln-sugerencias-item";
        item.textContent = nombre;
        item.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ej.nombre = nombre;
          input.value = nombre;
          input.blur();
          this.ocultarSugerencias();
        };
        drop.appendChild(item);
      });
    }

    // Posicionar debajo del input
    const wrap = input.parentElement;
    wrap.style.position = "relative";
    wrap.appendChild(drop);
    this._sugerenciasEl = drop;

    // Scroll para que se vea
    setTimeout(() => {
      drop.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  renderEjercicios() {
    this.ejsContainer.empty();
    this.ocultarSugerencias();
    const uTxt = this.unidad === "lbs" ? "lbs" : "kg";

    this.ejercicios.forEach((ej, ei) => {
      const card = this.ejsContainer.createDiv({ cls: "ln-agregar-ej-card" });

      // Nombre + eliminar
      const top = card.createDiv({ cls: "ln-agregar-ej-top" });
      const nameInput = top.createEl("input", {
        type: "text",
        cls: "ln-input",
        attr: {
          placeholder: `Ejercicio ${ei + 1} · toca para elegir`,
          enterkeyhint: "done",
          autocomplete: "off",
          autocorrect: "off",
        },
        value: ej.nombre,
      });
      nameInput.oninput = () => {
        ej.nombre = nameInput.value;
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
      };
      nameInput.onfocus = () => {
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
        setTimeout(() => {
          nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      };
      // Enter → cierra teclado y sugerencias
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Si hay sugerencias visibles, tomar la primera
          if (this._sugerenciasEl) {
            const first = this._sugerenciasEl.querySelector(".ln-sugerencias-item");
            if (first && !nameInput.value.trim()) {
              first.click();
              return;
            }
          }
          nameInput.blur();
          this.ocultarSugerencias();
        }
      });

      if (this.ejercicios.length > 1) {
        const del = top.createEl("button", { text: "✕", cls: "ln-icon-btn ln-agregar-del" });
        del.onclick = () => {
          this.ejercicios.splice(ei, 1);
          this.renderEjercicios();
        };
      }

      // Series
      const seriesBox = card.createDiv({ cls: "ln-agregar-series" });
      ej.series.forEach((s, si) => {
        const row = seriesBox.createDiv({ cls: "ln-agregar-serie-row" });
        row.createEl("span", { text: `${si + 1}`, cls: "ln-agregar-serie-num" });

        const pesoIn = row.createEl("input", {
          type: "number",
          cls: "ln-input",
          attr: { placeholder: uTxt, inputmode: "decimal", step: "any", enterkeyhint: "next" },
          value: s.peso,
        });
        pesoIn.oninput = () => { s.peso = pesoIn.value; };
        this._bindEnterBlur(pesoIn);

        row.createEl("span", { text: "×", cls: "ln-agregar-x" });

        const esFallo = s.reps === "∞" || s.reps === "inf" || String(s.reps).toLowerCase() === "al fallo";
        const repsWrap = row.createDiv({ cls: "ln-reps-wrap" });
        const repsIn = repsWrap.createEl("input", {
          type: "text",
          cls: "ln-input" + (esFallo ? " ln-reps-fallo" : ""),
          attr: { placeholder: "reps", inputmode: "numeric", enterkeyhint: "done" },
          value: esFallo ? "∞" : (s.reps || ""),
        });
        const falloBtn = repsWrap.createEl("button", {
          text: "∞",
          cls: "ln-fallo-btn" + (esFallo ? " on" : ""),
          attr: { "aria-label": "Al fallo", title: "Repeticiones al fallo" },
        });
        repsIn.oninput = () => {
          const v = repsIn.value.trim();
          if (v === "∞" || v.toLowerCase() === "inf" || v.toLowerCase() === "fallo") {
            s.reps = "∞";
            repsIn.value = "∞";
            repsIn.classList.add("ln-reps-fallo");
            falloBtn.classList.add("on");
          } else {
            s.reps = v;
            repsIn.classList.remove("ln-reps-fallo");
            falloBtn.classList.remove("on");
          }
        };
        this._bindEnterBlur(repsIn);
        falloBtn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (s.reps === "∞") {
            s.reps = "";
            repsIn.value = "";
            repsIn.classList.remove("ln-reps-fallo");
            falloBtn.classList.remove("on");
          } else {
            s.reps = "∞";
            repsIn.value = "∞";
            repsIn.classList.add("ln-reps-fallo");
            falloBtn.classList.add("on");
          }
        };
      });

      // Agregar / quitar serie
      const seriesActions = card.createDiv({ cls: "ln-agregar-serie-actions" });
      const addSerie = seriesActions.createEl("button", { text: "+ Serie", cls: "ln-btn-link" });
      addSerie.onclick = () => {
        ej.series.push({ peso: "", reps: "" });
        this.renderEjercicios();
      };
      if (ej.series.length > 1) {
        const rmSerie = seriesActions.createEl("button", { text: "− Quitar serie", cls: "ln-btn-link" });
        rmSerie.onclick = () => {
          ej.series.pop();
          this.renderEjercicios();
        };
      }
    });
  }

  async guardar() {
    const nombre = (this.rutinaNombre || "").trim();
    if (!nombre) {
      new Notice("Ponle un nombre a la rutina");
      return;
    }

    // Si es día de descanso / enfermo → guardar como especial (sin series)
    const tipoEsp = tipoDiaEspecial(nombre);
    if (tipoEsp) {
      if (!this.plugin.settings.asignaciones) this.plugin.settings.asignaciones = {};
      this.plugin.settings.asignaciones[this.fecha] = nombre;
      await this.plugin.saveSettings();
      await this.plugin.guardarDiaEspecial(this.fecha, nombre, tipoEsp);
      new Notice(`Guardado · ${nombre}`);
      this.close();
      if (this.onSave) this.onSave();
      return;
    }

    // Filtrar ejercicios y series válidas
    const ejerciciosLimpios = [];
    for (const ej of this.ejercicios) {
      const n = (ej.nombre || "").trim();
      if (!n) continue;
      const seriesValidas = ej.series
        .filter((s) => s.peso !== "" || s.reps !== "")
        .map((s) => ({
          peso: s.peso || "0",
          reps: s.reps || "0",
          hecho: true,
          saltada: false,
        }));
      if (seriesValidas.length === 0) continue;
      ejerciciosLimpios.push({ nombre: n, sets: seriesValidas });
    }

    if (!ejerciciosLimpios.length) {
      new Notice("Agrega al menos un ejercicio con series (o elige Descanso / 😴)");
      return;
    }

    const sesion = {
      rutina: nombre,
      fecha: this.fecha,
      inicio: "",
      fin: "",
      duracionMin: this.duracionMin ? parseInt(this.duracionMin, 10) || 0 : 0,
      unidad: this.unidad,
      ejercicios: ejerciciosLimpios,
      notas: "",
    };

    await this.plugin.guardarSesion(sesion);

    // Actualizar también la asignación del calendario
    if (!this.plugin.settings.asignaciones) this.plugin.settings.asignaciones = {};
    this.plugin.settings.asignaciones[this.fecha] = nombre;
    await this.plugin.saveSettings();

    new Notice(`Guardado · ${nombre}`);
    this.close();
    if (this.onSave) this.onSave();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal para EDITAR el registro de un día (no la plantilla de rutina) ─────
class EditarHistorialModal extends Modal {
  constructor(app, plugin, fecha, sesionExistente, onSave) {
    super(app);
    this.plugin = plugin;
    this.fecha = fecha;
    this.onSave = onSave;
    this.path = sesionExistente.path || null;
    this.unidad = lnNormUnidad(sesionExistente.unidad || plugin.settings.unidadPeso || "kg");
    this.rutinaNombre = (sesionExistente.nombre || "").trim();
    this.duracionMin = sesionExistente.duracionMin ? String(sesionExistente.duracionMin) : "";
    this.inicio = sesionExistente.inicio || "";
    this.fin = sesionExistente.fin || "";
    // Parsear body existente → estructura editable
    this.ejercicios = this._parseBodyToEjercicios(sesionExistente.body || "");
    if (!this.ejercicios.length) {
      this.ejercicios = [
        { nombre: "", series: [{ peso: "", reps: "" }, { peso: "", reps: "" }, { peso: "", reps: "" }] }
      ];
    }
    this.nombresEjercicios = [];
    this._sugerenciasEl = null;
  }

  _parseBodyToEjercicios(body) {
    if (!body) return [];
    const ejercicios = [];
    let actual = null;
    body.split("\n").forEach((line) => {
      const h = line.match(/^##\s+(.+)/);
      if (h) {
        actual = { nombre: h[1].trim(), series: [] };
        ejercicios.push(actual);
        return;
      }
      if (actual && line.trim().startsWith("-")) {
        const txt = line.replace(/^-\s*/, "").trim();
        // Serie N: 40 lbs × 10 reps  |  Serie N: 40 lbs × ∞ (al fallo)  |  saltada
        const mFallo = txt.match(/Serie\s+\d+:\s*([\d.]+)\s*(?:kg|lbs|lb)?\s*[×x]\s*(?:∞|inf)\s*(?:\(al fallo\))?/i);
        const m = txt.match(/Serie\s+\d+:\s*([\d.]+)\s*(?:kg|lbs|lb)?\s*[×x]\s*(\d+)\s*reps/i);
        if (mFallo) {
          actual.series.push({ peso: mFallo[1], reps: "∞" });
        } else if (m) {
          actual.series.push({ peso: m[1], reps: m[2] });
        } else if (/saltada/i.test(txt)) {
          actual.series.push({ peso: "", reps: "" });
        }
      }
    });
    // Asegurar al menos 1 serie por ejercicio
    ejercicios.forEach((ej) => {
      if (!ej.series.length) {
        ej.series = [{ peso: "", reps: "" }, { peso: "", reps: "" }, { peso: "", reps: "" }];
      }
    });
    return ejercicios;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    modalEl.addClass("ln-agregar-hist-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    await this.cargarNombresEjercicios();

    const [y, m, d] = this.fecha.split("-");
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const fechaTxt = `${parseInt(d, 10)} de ${meses[parseInt(m, 10) - 1]} ${y}`;

    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar cambios", cls: "ln-btn ln-btn-primary" });
    save.onclick = () => this.guardar();

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    this.bodyEl = body;

    const header = body.createDiv({ cls: "ln-agregar-header" });
    header.createEl("div", { text: "Editar ejercicios del día", cls: "ln-agregar-title" });
    header.createEl("div", { text: fechaTxt, cls: "ln-agregar-fecha" });
    header.createEl("p", {
      text: "Cambia nombres, pesos o reps de lo que hiciste este día. No modifica la plantilla de rutina.",
      cls: "ln-muted ln-agregar-sub"
    });

    body.createEl("label", { text: "Nombre de la sesión", cls: "ln-label" });
    const inputRutina = body.createEl("input", {
      type: "text",
      cls: "ln-input ln-input-lg",
      attr: { placeholder: "Ej. Hombros + Trapecios…", enterkeyhint: "done" },
      value: this.rutinaNombre,
    });
    inputRutina.oninput = () => { this.rutinaNombre = inputRutina.value; };
    this._bindEnterBlur(inputRutina);

    body.createEl("label", { text: "Duración (min)", cls: "ln-label", attr: { style: "margin-top: 12px;" } });
    const inputDur = body.createEl("input", {
      type: "number",
      cls: "ln-input",
      attr: { placeholder: "Opcional", min: "1", inputmode: "numeric", enterkeyhint: "done" },
      value: this.duracionMin,
    });
    inputDur.oninput = () => { this.duracionMin = inputDur.value; };
    this._bindEnterBlur(inputDur);

    body.createEl("label", { text: "Ejercicios", cls: "ln-label", attr: { style: "margin-top: 18px;" } });
    this.ejsContainer = body.createDiv({ cls: "ln-agregar-ejs" });
    this.renderEjercicios();

    const addEj = body.createEl("button", { text: "+ Agregar ejercicio", cls: "ln-btn ln-btn-ghost ln-btn-block" });
    addEj.style.marginTop = "10px";
    addEj.onclick = () => {
      this.ocultarSugerencias();
      this.ejercicios.push({
        nombre: "",
        series: [{ peso: "", reps: "" }, { peso: "", reps: "" }, { peso: "", reps: "" }]
      });
      this.renderEjercicios();
    };

    contentEl.addEventListener("click", (e) => {
      if (!e.target.closest(".ln-agregar-ej-top") && !e.target.closest(".ln-sugerencias-drop")) {
        this.ocultarSugerencias();
      }
    });
  }

  async cargarNombresEjercicios() {
    const set = new Set();
    (this.plugin.settings.bdEjercicios || []).forEach((item) => {
      const n = lnNombreEj(item);
      if (n) set.add(n);
    });
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      (data.ejercicios || []).forEach((e) => {
        if (e.nombre) set.add(e.nombre.trim());
      });
    } catch (_) {}
    try {
      const rutinas = await this.plugin.listarRutinas();
      for (const r of rutinas) {
        (r.ejercicios || []).forEach((ej) => {
          if (ej.nombre) set.add(ej.nombre.trim());
        });
      }
    } catch (_) {}
    this.nombresEjercicios = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  _bindEnterBlur(input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
        this.ocultarSugerencias();
      }
    });
  }

  ocultarSugerencias() {
    if (this._sugerenciasEl) {
      this._sugerenciasEl.remove();
      this._sugerenciasEl = null;
    }
  }

  mostrarSugerencias(input, ej, filtro) {
    this.ocultarSugerencias();
    const q = (filtro || "").trim().toLowerCase();
    let lista = this.nombresEjercicios;
    if (q) {
      lista = lista.filter((n) => n.toLowerCase().includes(q));
    }
    lista = lista.slice(0, 8);

    const drop = document.createElement("div");
    drop.className = "ln-sugerencias-drop";

    if (lista.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ln-sugerencias-empty";
      empty.textContent = q
        ? "No hay coincidencias · escribe uno nuevo"
        : "Aún no hay ejercicios en tu historial · escribe el nombre";
      drop.appendChild(empty);
    } else {
      lista.forEach((nombre) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ln-sugerencias-item";
        item.textContent = nombre;
        item.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ej.nombre = nombre;
          input.value = nombre;
          input.blur();
          this.ocultarSugerencias();
        };
        drop.appendChild(item);
      });
    }

    const wrap = input.parentElement;
    wrap.style.position = "relative";
    wrap.appendChild(drop);
    this._sugerenciasEl = drop;

    setTimeout(() => {
      drop.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  renderEjercicios() {
    this.ejsContainer.empty();
    this.ocultarSugerencias();
    const uTxt = this.unidad === "lbs" ? "lbs" : "kg";

    this.ejercicios.forEach((ej, ei) => {
      const card = this.ejsContainer.createDiv({ cls: "ln-agregar-ej-card" });

      const top = card.createDiv({ cls: "ln-agregar-ej-top" });
      const nameInput = top.createEl("input", {
        type: "text",
        cls: "ln-input",
        attr: {
          placeholder: `Ejercicio ${ei + 1} · toca para elegir`,
          enterkeyhint: "done",
          autocomplete: "off",
          autocorrect: "off",
        },
        value: ej.nombre,
      });
      nameInput.oninput = () => {
        ej.nombre = nameInput.value;
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
      };
      nameInput.onfocus = () => {
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
        setTimeout(() => {
          nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      };
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (this._sugerenciasEl) {
            const first = this._sugerenciasEl.querySelector(".ln-sugerencias-item");
            if (first && !nameInput.value.trim()) {
              first.click();
              return;
            }
          }
          nameInput.blur();
          this.ocultarSugerencias();
        }
      });

      if (this.ejercicios.length > 1) {
        const del = top.createEl("button", { text: "✕", cls: "ln-icon-btn ln-agregar-del" });
        del.onclick = () => {
          this.ejercicios.splice(ei, 1);
          this.renderEjercicios();
        };
      }

      const seriesBox = card.createDiv({ cls: "ln-agregar-series" });
      ej.series.forEach((s, si) => {
        const row = seriesBox.createDiv({ cls: "ln-agregar-serie-row" });
        row.createEl("span", { text: `${si + 1}`, cls: "ln-agregar-serie-num" });

        const pesoIn = row.createEl("input", {
          type: "number",
          cls: "ln-input",
          attr: { placeholder: uTxt, inputmode: "decimal", step: "any", enterkeyhint: "next" },
          value: s.peso,
        });
        pesoIn.oninput = () => { s.peso = pesoIn.value; };
        this._bindEnterBlur(pesoIn);

        row.createEl("span", { text: "×", cls: "ln-agregar-x" });

        const esFallo = s.reps === "∞" || s.reps === "inf" || String(s.reps).toLowerCase() === "al fallo";
        const repsWrap = row.createDiv({ cls: "ln-reps-wrap" });
        const repsIn = repsWrap.createEl("input", {
          type: "text",
          cls: "ln-input" + (esFallo ? " ln-reps-fallo" : ""),
          attr: { placeholder: "reps", inputmode: "numeric", enterkeyhint: "done" },
          value: esFallo ? "∞" : (s.reps || ""),
        });
        const falloBtn = repsWrap.createEl("button", {
          text: "∞",
          cls: "ln-fallo-btn" + (esFallo ? " on" : ""),
          attr: { "aria-label": "Al fallo", title: "Repeticiones al fallo" },
        });
        repsIn.oninput = () => {
          const v = repsIn.value.trim();
          if (v === "∞" || v.toLowerCase() === "inf" || v.toLowerCase() === "fallo") {
            s.reps = "∞";
            repsIn.value = "∞";
            repsIn.classList.add("ln-reps-fallo");
            falloBtn.classList.add("on");
          } else {
            s.reps = v;
            repsIn.classList.remove("ln-reps-fallo");
            falloBtn.classList.remove("on");
          }
        };
        this._bindEnterBlur(repsIn);
        falloBtn.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (s.reps === "∞") {
            s.reps = "";
            repsIn.value = "";
            repsIn.classList.remove("ln-reps-fallo");
            falloBtn.classList.remove("on");
          } else {
            s.reps = "∞";
            repsIn.value = "∞";
            repsIn.classList.add("ln-reps-fallo");
            falloBtn.classList.add("on");
          }
        };
      });

      const seriesActions = card.createDiv({ cls: "ln-agregar-serie-actions" });
      const addSerie = seriesActions.createEl("button", { text: "+ Serie", cls: "ln-btn-link" });
      addSerie.onclick = () => {
        ej.series.push({ peso: "", reps: "" });
        this.renderEjercicios();
      };
      if (ej.series.length > 1) {
        const rmSerie = seriesActions.createEl("button", { text: "− Quitar serie", cls: "ln-btn-link" });
        rmSerie.onclick = () => {
          ej.series.pop();
          this.renderEjercicios();
        };
      }
    });
  }

  async guardar() {
    const nombre = (this.rutinaNombre || "").trim();
    if (!nombre) {
      new Notice("Ponle un nombre a la sesión");
      return;
    }

    const ejerciciosLimpios = [];
    for (const ej of this.ejercicios) {
      const n = (ej.nombre || "").trim();
      if (!n) continue;
      const seriesValidas = ej.series
        .filter((s) => s.peso !== "" || s.reps !== "")
        .map((s) => ({
          peso: s.peso || "0",
          reps: s.reps || "0",
          hecho: true,
          saltada: false,
        }));
      if (seriesValidas.length === 0) continue;
      ejerciciosLimpios.push({ nombre: n, sets: seriesValidas });
    }

    if (!ejerciciosLimpios.length) {
      new Notice("Deja al menos un ejercicio con series");
      return;
    }

    const sesion = {
      rutina: nombre,
      fecha: this.fecha,
      inicio: this.inicio || "",
      fin: this.fin || "",
      duracionMin: this.duracionMin ? parseInt(this.duracionMin, 10) || 0 : 0,
      unidad: this.unidad,
      ejercicios: ejerciciosLimpios,
      notas: "",
    };

    await this.plugin.actualizarSesion(sesion, this.path);

    // Actualizar también la asignación del calendario
    if (!this.plugin.settings.asignaciones) this.plugin.settings.asignaciones = {};
    this.plugin.settings.asignaciones[this.fecha] = nombre;
    await this.plugin.saveSettings();

    new Notice(`Guardado · ${nombre}`);
    this.close();
    if (this.onSave) this.onSave();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal ver registro del día (historial) ─────────────────────────────────
class VerHistorialDiaModal extends Modal {
  constructor(app, plugin, fecha, sesiones, esPasado = false) {
    super(app);
    this.plugin = plugin;
    this.fecha = fecha;
    this.sesiones = sesiones || [];
    this.esPasado = esPasado;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top ln-hist-actions" });

    // Cerrar (icono + texto)
    const closeBtn = actions.createEl("button", { cls: "ln-btn ln-btn-ghost ln-btn-with-ico" });
    const closeIco = closeBtn.createEl("span", { cls: "ln-btn-ico" });
    closeIco.innerHTML = lnIcon("cerrar");
    closeBtn.createEl("span", { text: "Cerrar", cls: "ln-btn-txt" });
    closeBtn.onclick = () => this.close();

    // Editar único → menú con nombre + ejercicios
    const editBtn = actions.createEl("button", { cls: "ln-btn ln-btn-ghost ln-btn-with-ico" });
    const editIco = editBtn.createEl("span", { cls: "ln-btn-ico" });
    editIco.innerHTML = lnIcon("editar");
    editBtn.createEl("span", { text: "Editar", cls: "ln-btn-txt" });
    editBtn.onclick = () => {
      // Toggle menú de opciones de edición
      let menu = contentEl.querySelector(".ln-edit-menu");
      if (menu) {
        menu.remove();
        return;
      }
      menu = contentEl.createDiv({ cls: "ln-edit-menu" });

      const optNombre = menu.createEl("button", { cls: "ln-edit-opt" });
      const icoN = optNombre.createEl("span", { cls: "ln-edit-opt-ico" });
      icoN.innerHTML = lnIcon("nombre");
      const txtN = optNombre.createDiv({ cls: "ln-edit-opt-txt" });
      txtN.createEl("div", { text: "Editar nombre", cls: "ln-edit-opt-title" });
      txtN.createEl("div", { text: "Cambiar el nombre de la rutina del día", cls: "ln-edit-opt-sub" });
      optNombre.onclick = () => {
        this.close();
        const asignado = (this.plugin.settings.asignaciones || {})[this.fecha] || "";
        new AsignarRutinaModal(this.app, this.plugin, this.fecha, asignado, () => {
          this.plugin.refreshView();
        }).open();
      };

      const optEj = menu.createEl("button", { cls: "ln-edit-opt" });
      const icoE = optEj.createEl("span", { cls: "ln-edit-opt-ico" });
      icoE.innerHTML = lnIcon("lista");
      const txtE = optEj.createDiv({ cls: "ln-edit-opt-txt" });
      txtE.createEl("div", { text: "Editar ejercicios", cls: "ln-edit-opt-title" });
      txtE.createEl("div", { text: "Modificar series, pesos y reps de este día", cls: "ln-edit-opt-sub" });
      optEj.onclick = () => {
        if (!this.sesiones || !this.sesiones.length) {
          new Notice("No hay registro de ejercicios en este día para editar");
          return;
        }
        const ses = this.sesiones[0];
        this.close();
        new EditarHistorialModal(this.app, this.plugin, this.fecha, ses, () => {
          this.plugin.refreshView();
        }).open();
      };

      // Si es día pasado, también ofrecer agregar
      if (this.esPasado) {
        const optAdd = menu.createEl("button", { cls: "ln-edit-opt ln-edit-opt-add" });
        const icoA = optAdd.createEl("span", { cls: "ln-edit-opt-ico" });
        icoA.setText("+");
        const txtA = optAdd.createDiv({ cls: "ln-edit-opt-txt" });
        txtA.createEl("div", { text: "Agregar entrenamiento", cls: "ln-edit-opt-title" });
        txtA.createEl("div", { text: "Registrar otro entrenamiento en este día", cls: "ln-edit-opt-sub" });
        optAdd.onclick = () => {
          this.close();
          new AgregarHistorialModal(this.app, this.plugin, this.fecha, () => {
            this.plugin.refreshView();
          }).open();
        };
      }
    };

    const body = contentEl.createDiv({ cls: "ln-form-body" });

    // Título con fecha legible
    const [y, m, d] = this.fecha.split("-");
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const fechaTxt = `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]} ${y}`;
    body.createEl("h2", { text: "Registro del día" });
    body.createEl("p", { text: fechaTxt, cls: "ln-muted" });

    if (!this.sesiones.length) {
      body.createEl("p", { text: "No hay entrenamientos registrados este día.", cls: "ln-muted" });
      return;
    }

    this.sesiones.forEach((ses, idx) => {
      const card = body.createDiv({ cls: "ln-hist-card" });
      card.createEl("div", { text: ses.nombre, cls: "ln-hist-title" });

      const meta = card.createDiv({ cls: "ln-hist-meta" });
      if (ses.inicio || ses.fin) {
        meta.createEl("span", { text: `${ses.inicio || "—"} → ${ses.fin || "—"}` });
      }
      if (ses.duracionMin) {
        meta.createEl("span", { text: ` · ${ses.duracionMin} min` });
      }
      if (ses.unidad) {
        meta.createEl("span", { text: ` · ${ses.unidad}` });
      }

      // Parsear ejercicios del body
      const ejercicios = this.parseBody(ses.body);
      if (ejercicios.length) {
        const list = card.createDiv({ cls: "ln-hist-ejs" });
        ejercicios.forEach((ej) => {
          const ejBox = list.createDiv({ cls: "ln-hist-ej" });
          ejBox.createEl("div", { text: ej.nombre, cls: "ln-hist-ej-name" });
          ej.series.forEach((s) => {
            ejBox.createEl("div", { text: s, cls: "ln-hist-serie" });
          });
        });
      } else if (ses.body) {
        // Fallback: mostrar el markdown crudo limpio
        const pre = card.createEl("pre", { cls: "ln-hist-raw" });
        pre.setText(ses.body);
      }
    });

    // Botón visible y claro para dejar el día en blanco
    const delWrap = body.createDiv({ cls: "ln-hist-delete-wrap" });
    const delBtn = delWrap.createEl("button", {
      text: "Eliminar registro del día",
      cls: "ln-btn ln-btn-danger",
    });
    delBtn.onclick = async () => {
      const ok = await this.plugin.borrarRegistroDia(this.fecha, true);
      if (ok) {
        this.close();
        this.plugin.refreshView();
      }
    };
  }

  parseBody(body) {
    if (!body) return [];
    const ejercicios = [];
    let actual = null;
    body.split("\n").forEach((line) => {
      const h = line.match(/^##\s+(.+)/);
      if (h) {
        actual = { nombre: h[1].trim(), series: [] };
        ejercicios.push(actual);
        return;
      }
      if (actual && line.trim().startsWith("-")) {
        actual.series.push(line.replace(/^-\s*/, "").trim());
      }
    });
    return ejercicios;
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal buscador de ejercicios (progresión individual) ───────────────────
class BuscadorEjerciciosModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.ejercicios = [];
    this.unidad = "kg";
    this.query = "";
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    modalEl.addClass("ln-search-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");
    contentEl.addClass("ln-search-form");

    // Cabecera fija: Cerrar + título + buscador (siempre visible encima del teclado)
    const header = contentEl.createDiv({ cls: "ln-search-header" });
    const actions = header.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const closeBtn = actions.createEl("button", { text: "Cerrar", cls: "ln-btn ln-btn-ghost" });
    closeBtn.onclick = () => {
      try { this.inputEl && this.inputEl.blur(); } catch (_) {}
      this.close();
    };

    header.createEl("h2", { text: "Buscar ejercicio", cls: "ln-search-title" });
    header.createEl("p", {
      text: "Escribe para filtrar · Enter para ocultar teclado",
      cls: "ln-muted ln-search-sub",
    });

    const searchWrap = header.createDiv({ cls: "ln-search-wrap" });
    const input = searchWrap.createEl("input", {
      cls: "ln-search-input",
      attr: {
        type: "search",
        placeholder: "Ej. press de banca, sentadilla…",
        autocomplete: "off",
        autocapitalize: "off",
        enterkeyhint: "search",
        inputmode: "search",
      },
    });
    this.inputEl = input;

    // Zona scrollable de resultados (debajo del header fijo)
    const body = contentEl.createDiv({ cls: "ln-form-body ln-search-body" });
    this.listEl = body.createDiv({ cls: "ln-search-results" });
    this.detailEl = body.createDiv({ cls: "ln-search-detail" });
    this.detailEl.style.display = "none";

    this.listEl.createEl("p", { text: "Cargando ejercicios…", cls: "ln-muted" });
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      this.ejercicios = data.ejercicios;
      this.unidad = data.unidad === "lbs" ? "lbs" : "kg";
    } catch (_) {
      this.ejercicios = [];
    }

    input.oninput = () => {
      this.query = (input.value || "").trim().toLowerCase();
      this.renderList();
    };

    // Enter / Buscar en teclado iPhone → ocultar teclado y dejar ver resultados
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        try { input.blur(); } catch (_) {}
      }
    });
    // Algunos teclados iOS disparan "search" en type=search
    input.addEventListener("search", () => {
      try { input.blur(); } catch (_) {}
    });

    this.renderList();

    setTimeout(() => {
      try { input.focus(); } catch (_) {}
    }, 150);
  }

  renderList() {
    this.listEl.empty();
    this.detailEl.style.display = "none";
    this.listEl.style.display = "";

    if (!this.ejercicios.length) {
      this.listEl.createEl("p", {
        text: "Aún no hay ejercicios registrados en el historial.",
        cls: "ln-muted",
      });
      return;
    }

    const q = this.query;
    const filtered = q
      ? this.ejercicios.filter((e) => e.nombre.toLowerCase().includes(q))
      : this.ejercicios;

    if (!filtered.length) {
      this.listEl.createEl("p", {
        text: `Ningún ejercicio coincide con “${this.query}”.`,
        cls: "ln-muted",
      });
      return;
    }

    // Mostrar máximo ~40 para no saturar
    filtered.slice(0, 40).forEach((ej) => {
      const item = this.listEl.createEl("button", { cls: "ln-selector-item" });
      const left = item.createDiv({ cls: "ln-selector-item-left" });
      left.createEl("div", { text: ej.nombre, cls: "ln-selector-item-title" });
      const maxTxt = ej.maxPeso
        ? `Máx ${this.fmtPeso(ej.maxPeso)} ${this.unidad}`
        : "Sin pesos";
      left.createEl("div", { text: maxTxt, cls: "ln-selector-item-meta" });
      const arrow = item.createDiv({ cls: "ln-selector-item-play" });
      arrow.setText("→");
      item.onclick = () => this.showDetail(ej);
    });

    if (filtered.length > 40) {
      this.listEl.createEl("p", {
        text: `Mostrando 40 de ${filtered.length}. Afina la búsqueda.`,
        cls: "ln-muted",
      });
    }
  }

  showDetail(ej) {
    try { this.inputEl && this.inputEl.blur(); } catch (_) {}
    this.listEl.style.display = "none";
    this.detailEl.style.display = "";
    this.detailEl.empty();

    // Scroll al inicio del área de resultados
    const body = this.contentEl.querySelector(".ln-search-body");
    if (body) body.scrollTop = 0;

    // Volver
    const back = this.detailEl.createEl("button", {
      text: "← Volver a resultados",
      cls: "ln-btn ln-btn-ghost",
    });
    back.style.marginBottom = "12px";
    back.onclick = () => this.renderList();

    this.detailEl.createEl("h3", { text: ej.nombre, cls: "ln-search-detail-title" });

    // Resumen máximo
    const summary = this.detailEl.createDiv({ cls: "ln-hist-card" });
    summary.createEl("div", { text: "Progresión", cls: "ln-hist-ej-name" });

    if (ej.maxPeso) {
      summary.createEl("div", {
        text: `Peso máximo: ${this.fmtPeso(ej.maxPeso)} ${this.unidad}`,
        cls: "ln-hist-serie",
      });
    }
    if (ej.mejorSerie) {
      const ms = ej.mejorSerie;
      const fechaTxt = ms.fecha ? ` (${ms.fecha})` : "";
      summary.createEl("div", {
        text: `Mejor serie: ${this.fmtPeso(ms.peso)} ${this.unidad} × ${ms.reps} reps${fechaTxt}`,
        cls: "ln-hist-serie",
      });
    }

    // Historial reciente
    if (ej.sesiones && ej.sesiones.length) {
      const histTitle = this.detailEl.createEl("p", {
        text: "Últimas sesiones",
        cls: "ln-muted",
      });
      histTitle.style.margin = "16px 0 8px";
      histTitle.style.fontWeight = "700";

      ej.sesiones.forEach((ses) => {
        const card = this.detailEl.createDiv({ cls: "ln-hist-card" });
        card.createEl("div", {
          text: ses.fecha || "Sin fecha",
          cls: "ln-hist-title",
        });
        const list = card.createDiv({ cls: "ln-hist-ejs" });
        ses.series.forEach((s, i) => {
          list.createEl("div", {
            text: `Serie ${i + 1}: ${this.fmtPeso(s.peso)} ${this.unidad} × ${s.reps} reps`,
            cls: "ln-hist-serie",
          });
        });
      });
    }
  }

  fmtPeso(n) {
    if (n == null || isNaN(n)) return "—";
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal selector de rutina (botón Empezar entrenamiento) ─────────────────
class SelectorRutinaModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    // Botón cerrar arriba
    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cerrar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();

    const body = contentEl.createDiv({ cls: "ln-form-body" });
    body.createEl("h2", { text: "Empezar entrenamiento" });
    body.createEl("p", { text: "Elige la rutina que vas a hacer", cls: "ln-muted" });

    const list = body.createDiv({ cls: "ln-selector-list" });

    const rutinas = await this.plugin.listarRutinas();
    if (!rutinas.length) {
      const vacio = list.createDiv({ cls: "ln-vacio" });
      vacio.createEl("p", { text: "Aún no tienes rutinas." });
      const b = vacio.createEl("button", { text: "Crear la primera", cls: "ln-btn ln-btn-primary" });
      b.onclick = () => {
        this.close();
        this.plugin.crearRutina();
      };
      return;
    }

    rutinas.forEach((r) => {
      const item = list.createEl("button", { cls: "ln-selector-item" });
      const left = item.createDiv({ cls: "ln-selector-item-left" });
      left.createEl("div", { text: r.nombre, cls: "ln-selector-item-title" });
      left.createEl("div", { text: `${r.ejercicios.length} ejercicios`, cls: "ln-selector-item-meta" });
      const play = item.createDiv({ cls: "ln-selector-item-play" });
      play.setText("▶");
      item.onclick = () => {
        this.close();
        this.plugin.iniciarSesion(r);
      };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Modal sesión (estilo Hevy) ──────────────────────────────────────────────
class SesionModal extends Modal {
  constructor(app, plugin, rutina, estadoGuardado = null) {
    super(app);
    this.plugin = plugin;
    this.rutina = rutina;
    this.esLibre = !!(rutina && rutina.libre);
    this.timerId = null;
    this._visHandler = null;
    this.nombresEjercicios = []; // sugerencias en modo libre
    this.maxPesos = {}; // nombre_normalizado → peso máximo histórico (en unidad actual)
    this.unidad = lnNormUnidad(plugin.settings.unidadPeso || "kg");

    // Restaurar sesión en curso (minimizar / reabrir app) o empezar de cero
    if (estadoGuardado && estadoGuardado.sesion) {
      this.inicio = estadoGuardado.inicio || Date.now();
      this.inicioHora = estadoGuardado.inicioHora || horaAhora();
      this.ejIdx = estadoGuardado.ejIdx || 0;
      this.restTotal = estadoGuardado.restTotal || 0;
      this.restEndAt = estadoGuardado.restEndAt || 0;
      this.restLeft = 0;
      if (this.restEndAt > 0) {
        this.restLeft = Math.max(0, Math.round((this.restEndAt - Date.now()) / 1000));
        if (this.restLeft <= 0) {
          this.restEndAt = 0;
          this.restLeft = 0;
        }
      }
      this.sesion = JSON.parse(JSON.stringify(estadoGuardado.sesion));
      this.esLibre = !!(estadoGuardado.esLibre || (rutina && rutina.libre));
      if (estadoGuardado.unidad) this.unidad = lnNormUnidad(estadoGuardado.unidad);
    } else {
      this.inicio = Date.now();
      this.inicioHora = horaAhora();
      this.ejIdx = 0;
      this.restLeft = 0;
      this.restTotal = 0;
      this.restEndAt = 0;
      const listaEj = (rutina && rutina.ejercicios) ? rutina.ejercicios : [];
      this.sesion = {
        rutina: (rutina && rutina.nombre) || "Entrenamiento libre",
        fecha: hoyISO(),
        inicio: this.inicioHora,
        unidad: this.unidad,
        ejercicios: listaEj.map((ej) => ({
          nombre: ej.nombre,
          sets: Array.from({ length: ej.series || 3 }, () => ({
            peso: ej.peso || "",
            reps: "",
            hecho: false,
            saltada: false,
          })),
          descanso: ej.descanso || plugin.settings.descansoDefault || 90,
          notas: ej.notas || "",
          superserie: !!ej.superserie,
        })),
      };
    }
  }

  /** Guarda el progreso actual para que sobreviva minimizar / cerrar la modal / matar la app. */
  async persistirProgreso() {
    try {
      const estado = {
        rutinaNombre: (this.rutina && this.rutina.nombre) || this.sesion.rutina,
        esLibre: !!this.esLibre,
        inicio: this.inicio,
        inicioHora: this.inicioHora,
        ejIdx: this.ejIdx,
        restLeft: this.restLeft,
        restTotal: this.restTotal,
        restEndAt: this.restEndAt,
        unidad: this.unidad,
        sesion: JSON.parse(JSON.stringify(this.sesion)),
        guardadoEn: Date.now(),
      };
      this.plugin.settings.sesionActiva = estado;
      await this.plugin.saveSettings();
    } catch (_) {}
  }

  /** Minimiza la sesión: guarda progreso y cierra la modal sin perder nada. */
  async minimizar(irACalendario = false) {
    await this.persistirProgreso();
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    // Al minimizar liberamos wake lock (ahorro batería); el descanso sigue por timestamp
    window._lnSessionActiva = false;
    try { await lnReleaseWakeLock(); } catch (_) {}
    this.close();
    new Notice("Entrenamiento en pausa. Toca Continuar cuando quieras.");
    await this.plugin.refreshView();
    if (irACalendario) {
      try {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (leaves.length) {
          const view = leaves[0].view;
          if (view && view.tab !== undefined) {
            view.tab = "calendario";
            await view.render();
          }
        }
      } catch (_) {}
    }
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-sesion-modal");
    if (this.esLibre) modalEl.addClass("ln-sesion-libre");
    contentEl.empty();
    contentEl.addClass("ln-sesion");
    // Resincronizar temporizador al volver de segundo plano / cambiar de app
    this._visHandler = () => {
      if (this.restEndAt > 0) {
        this._syncRestFromEndAt();
        this.renderSesion();
        // Solo re-pedir wake lock si hay descanso activo
        if (document.visibilityState === "visible") {
          window._lnSessionActiva = true;
          lnRequestWakeLock();
        }
      }
    };
    document.addEventListener("visibilitychange", this._visHandler);
    window.addEventListener("pageshow", this._visHandler);

    // Solo pedimos permiso de notificaciones (la pantalla se mantiene encendida SOLO en descanso)
    lnEnsureNotifPermission();

    // Cargar nombres de ejercicios para sugerencias (modo libre)
    if (this.esLibre) {
      try {
        await this._cargarNombresEjercicios();
      } catch (_) {}
    }
    // Cargar pesos máximos del historial (placeholder sombra en inputs)
    try {
      await this._cargarMaxPesos();
    } catch (_) {}
    this.renderSesion();

    // Si se reanudó con descanso activo, reiniciar el intervalo del timer
    if (this.restLeft > 0 && this.restEndAt > 0 && !this.timerId) {
      const lastSpokenRef = { v: -1 };
      this.timerId = setInterval(() => {
        this._tickRest(lastSpokenRef);
      }, 250);
    }
  }

  async _cargarNombresEjercicios() {
    const set = new Set();
    // Prioridad: base de ejercicios del usuario
    (this.plugin.settings.bdEjercicios || []).forEach((item) => {
      const n = lnNombreEj(item);
      if (n) set.add(n);
    });
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      (data.ejercicios || []).forEach((e) => {
        if (e.nombre) set.add(e.nombre.trim());
      });
    } catch (_) {}
    try {
      const rutinas = await this.plugin.listarRutinas();
      for (const r of rutinas) {
        (r.ejercicios || []).forEach((ej) => {
          if (ej.nombre) set.add(ej.nombre.trim());
        });
      }
    } catch (_) {}
    this.nombresEjercicios = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  /** Carga el peso máximo histórico de cada ejercicio (para placeholder sombra). */
  async _cargarMaxPesos() {
    this.maxPesos = {};
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      const destU = lnNormUnidad(this.unidad || this.plugin.settings.unidadPeso || "kg");
      (data.ejercicios || []).forEach((ej) => {
        const key = (ej.nombre || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!key || !ej.maxPeso || ej.maxPeso <= 0) return;
        let p = ej.maxPeso;
        // indexar ya convierte a settings.unidadPeso; si la sesión usa otra, convertir
        const idxU = lnNormUnidad(data.unidad || destU);
        if (idxU !== destU) {
          p = parseFloat(lnConvertPeso(p, idxU, destU)) || p;
        }
        this.maxPesos[key] = p;
      });
    } catch (_) {
      this.maxPesos = {};
    }
  }

  _maxPesoDe(nombre) {
    const key = (nombre || "").toLowerCase().replace(/\s+/g, " ").trim();
    return this.maxPesos[key] || 0;
  }

  _fmtPlaceholderPeso(n) {
    if (!n || n <= 0) return "0";
    // entero si es casi entero
    const r = Math.round(n * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05) ? String(Math.round(r)) : String(r);
  }

  /** Volumen total de la sesión actual (solo series hechas) */
  calcularVolumenSesion() {
    let total = 0;
    (this.sesion.ejercicios || []).forEach((ej) => {
      (ej.sets || []).forEach((s) => {
        if (!s.hecho) return;
        const p = parseFloat(s.peso);
        const r = parseInt(s.reps, 10);
        if (!isNaN(p) && p > 0 && !isNaN(r) && r > 0) total += p * r;
      });
    });
    return Math.round(total);
  }

  _fmtVolumen(n) {
    if (!n || n <= 0) return "0";
    if (n >= 10000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }


  _ocultarSugerenciasSesion() {
    if (this._sugerenciasEl) {
      this._sugerenciasEl.remove();
      this._sugerenciasEl = null;
    }
  }

  _mostrarSugerenciasSesion(input, ej, filtro) {
    this._ocultarSugerenciasSesion();
    const q = (filtro || "").trim().toLowerCase();
    let lista = this.nombresEjercicios || [];
    if (q) lista = lista.filter((n) => n.toLowerCase().includes(q));
    lista = lista.slice(0, 10);

    const drop = document.createElement("div");
    drop.className = "ln-sugerencias-drop";
    if (!lista.length) {
      const empty = document.createElement("div");
      empty.className = "ln-sugerencias-empty";
      empty.textContent = q
        ? "Sin coincidencias · escribe uno nuevo"
        : "Base vacía · escribe el nombre o ábrela en Ejercicio";
      drop.appendChild(empty);
    } else {
      lista.forEach((nombre) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ln-sugerencias-item";
        item.textContent = nombre;
        item.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ej.nombre = nombre;
          input.value = nombre;
          input.blur();
          this._ocultarSugerenciasSesion();
          this.persistirProgreso();
        };
        drop.appendChild(item);
      });
    }
    const wrap = input.parentElement;
    if (wrap) {
      wrap.style.position = "relative";
      wrap.appendChild(drop);
    }
    this._sugerenciasEl = drop;
  }

  /** Añade un ejercicio vacío (o con nombre) al final y salta a él. */
  agregarEjercicioLibre(nombre = "") {
    this.sesion.ejercicios.push({
      nombre: (nombre || "").trim(),
      sets: [
        { peso: "", reps: "", hecho: false, saltada: false },
        { peso: "", reps: "", hecho: false, saltada: false },
        { peso: "", reps: "", hecho: false, saltada: false },
      ],
      descanso: this.plugin.settings.descansoDefault || 90,
      notas: "",
      superserie: false,
    });
    this.ejIdx = this.sesion.ejercicios.length - 1;
    this.renderSesion();
  }

  onClose() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    if (this._visHandler) {
      document.removeEventListener("visibilitychange", this._visHandler);
      window.removeEventListener("pageshow", this._visHandler);
      this._visHandler = null;
    }
    const { contentEl } = this;
    contentEl.empty();
  }

  /** Calcula restLeft a partir del timestamp absoluto (sigue corriendo en background). */
  _syncRestFromEndAt() {
    if (!this.restEndAt) return;
    const left = Math.max(0, Math.round((this.restEndAt - Date.now()) / 1000));
    this.restLeft = left;
    if (left <= 0) {
      this.restEndAt = 0;
      this.restLeft = 0;
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      try { lnSpeakFinish(); } catch (_) {}
      try { new Notice("⏰ Descanso terminado"); } catch (_) {}
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
      } catch (_) {}
      // Notificación local (aparece aunque la app esté en segundo plano, si el SO lo permite)
      try {
        const next = this.getNextSetInfo && this.getNextSetInfo();
        const body = next
          ? `${next.nombre} · Serie ${next.serie} de ${next.total}`
          : "¡A por la siguiente serie!";
        lnNotify("⏰ Descanso terminado", body, { tag: "liftnote-rest-done", requireInteraction: true });
      } catch (_) {}
      // Fin natural del descanso → soltar wake lock
      window._lnSessionActiva = false;
      try { lnReleaseWakeLock(); } catch (_) {}
    }
  }

  /**
   * Actualiza SOLO el reloj/anillo del descanso sin recrear el DOM.
   * Evita que el toque en Continuar/Saltar se pierda por re-renders cada 250ms.
   */
  _updateRestUI() {
    if (!(this.restLeft > 0)) return;
    const root = this.contentEl;
    if (!root) return;
    const timeEls = root.querySelectorAll(".ln-rest-clock");
    timeEls.forEach((el) => {
      try { el.setText(this.fmtTime(this.restLeft)); } catch (_) {
        try { el.textContent = this.fmtTime(this.restLeft); } catch (__) {}
      }
    });
    const humanEls = root.querySelectorAll(".ln-rest-livecard-timer");
    humanEls.forEach((el) => {
      try { el.setText(this.fmtTime(this.restLeft, true)); } catch (_) {
        try { el.textContent = this.fmtTime(this.restLeft, true); } catch (__) {}
      }
    });
    const progress = root.querySelector(".ln-rest-progress");
    if (progress) {
      const total = Math.max(1, this.restTotal || this.restLeft);
      const size = 210;
      const stroke = 8;
      const r = (size - stroke) / 2;
      const c = 2 * Math.PI * r;
      const pct = Math.max(0, Math.min(1, this.restLeft / total));
      const offset = c * (1 - pct);
      progress.setAttribute("stroke-dasharray", String(c));
      progress.setAttribute("stroke-dashoffset", String(offset));
    }
  }

  /** Tick del descanso: sincroniza tiempo y actualiza UI sin destruir botones. */
  _tickRest(lastSpokenRef) {
    const prev = this.restLeft;
    this._syncRestFromEndAt();
    if (this.restLeft > 0) {
      if (this.restLeft === 10 || (this.restLeft >= 1 && this.restLeft <= 5)) {
        if (lastSpokenRef && this.restLeft !== lastSpokenRef.v) {
          lastSpokenRef.v = this.restLeft;
          try { lnSpeakCountdown(this.restLeft); } catch (_) {}
        }
      }
      this._updateRestUI();
    } else if (prev > 0) {
      // Acaba de terminar → ahora sí re-render completo
      this.renderSesion();
    }
  }

  renderSesion() {
    const el = this.contentEl;
    el.empty();

    // Top bar
    const top = el.createDiv({ cls: "ln-sesion-top" });
    const back = top.createEl("button", { text: "↓", cls: "ln-icon-btn", attr: { "aria-label": "Minimizar", title: "Minimizar (no se pierde el progreso)" } });
    back.onclick = () => this.minimizar(false);
    top.createEl("div", { text: this.rutina.nombre, cls: "ln-sesion-title" });
    const finish = top.createEl("button", { text: "Terminar", cls: "ln-btn ln-btn-primary ln-btn-sm" });
    finish.onclick = () => this.terminar();

    // Barra de acciones rápidas: minimizar + ver días anteriores
    const quickBar = el.createDiv({ cls: "ln-sesion-quickbar" });
    const btnMin = quickBar.createEl("button", { text: "Minimizar", cls: "ln-btn ln-btn-ghost ln-btn-sm" });
    btnMin.onclick = () => this.minimizar(false);
    const btnCal = quickBar.createEl("button", { text: "📅 Días anteriores", cls: "ln-btn ln-btn-ghost ln-btn-sm" });
    btnCal.onclick = () => this.minimizar(true);
    quickBar.createEl("span", { text: "El progreso se guarda solo", cls: "ln-sesion-quick-hint" });

    // Volumen en vivo de la sesión
    const volActual = this.calcularVolumenSesion();
    if (volActual > 0) {
      const volBar = el.createDiv({ cls: "ln-sesion-volbar" });
      volBar.createEl("span", {
        text: "Volumen: " + this._fmtVolumen(volActual) + " " + (this.unidad || "kg"),
        cls: "ln-sesion-vol",
      });
    }

    // ── Pantalla de DESCANSO (tarjeta estilo Live Activity + reloj grande) ──
    if (this.restLeft > 0) {
      const total = Math.max(1, this.restTotal || this.restLeft);
      const nextInfo = this.getNextSetInfo();
      const lastInfo = this.getLastCompletedSetInfo();

      const rest = el.createDiv({ cls: "ln-rest-screen" });

      // Tarjeta tipo Live Activity (ejercicio actual / serie hecha)
      const card = rest.createDiv({ cls: "ln-rest-livecard" });
      const cardTop = card.createDiv({ cls: "ln-rest-livecard-top" });
      cardTop.createEl("span", { text: "Entrenamiento", cls: "ln-rest-livecard-app" });
      cardTop.createEl("span", {
        text: this.fmtTime(this.restLeft, true),
        cls: "ln-rest-livecard-timer",
      });

      if (lastInfo) {
        const mid = card.createDiv({ cls: "ln-rest-livecard-mid" });
        mid.createEl("div", { text: lastInfo.nombre, cls: "ln-rest-livecard-name" });
        mid.createEl("div", {
          text: `Serie ${lastInfo.serie} de ${lastInfo.total}`,
          cls: "ln-rest-livecard-set",
        });
        const bottom = card.createDiv({ cls: "ln-rest-livecard-bottom" });
        bottom.createEl("span", {
          text: lastInfo.textoPesoReps,
          cls: "ln-rest-livecard-stats",
        });
        bottom.createEl("span", { text: "✓", cls: "ln-rest-livecard-check" });
      } else if (nextInfo) {
        const mid = card.createDiv({ cls: "ln-rest-livecard-mid" });
        mid.createEl("div", { text: nextInfo.nombre, cls: "ln-rest-livecard-name" });
        mid.createEl("div", {
          text: `Serie ${nextInfo.serie} de ${nextInfo.total}`,
          cls: "ln-rest-livecard-set",
        });
      }

      rest.createEl("div", { text: "DESCANSO", cls: "ln-rest-kicker" });

      // Reloj grande + anillo
      const clockWrap = rest.createDiv({ cls: "ln-rest-clock-wrap" });
      const size = 210;
      const stroke = 8;
      const r = (size - stroke) / 2;
      const c = 2 * Math.PI * r;
      const pct = this.restLeft / total;
      const offset = c * (1 - pct);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svg.setAttribute("class", "ln-rest-ring");
      svg.innerHTML = `
        <circle class="ln-rest-track" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${stroke}"/>
        <circle class="ln-rest-progress" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      `;
      clockWrap.appendChild(svg);
      const timeEl = clockWrap.createDiv({ cls: "ln-rest-clock" });
      timeEl.setText(this.fmtTime(this.restLeft));

      // Qué viene después
      if (nextInfo) {
        const nextBox = rest.createDiv({ cls: "ln-rest-next" });
        nextBox.createEl("div", { text: "SIGUIENTE", cls: "ln-rest-next-label" });
        nextBox.createEl("div", { text: nextInfo.nombre, cls: "ln-rest-next-name" });
        nextBox.createEl("div", { text: `Serie ${nextInfo.serie}/${nextInfo.total}`, cls: "ln-rest-next-set" });
      } else {
        rest.createEl("div", { text: "Última serie del ejercicio", cls: "ln-rest-next-done" });
      }

      // Acciones: ajustar tiempo (±15 / ±30) + Saltar
      const side = rest.createDiv({ cls: "ln-rest-side" });
      const adjust = (delta) => {
        if (!this.restEndAt) this.restEndAt = Date.now() + this.restLeft * 1000;
        this.restEndAt += delta * 1000;
        const minEnd = Date.now() + 1000;
        if (this.restEndAt < minEnd) this.restEndAt = minEnd;
        this.restTotal = Math.max(this.restTotal || total, Math.round((this.restEndAt - Date.now()) / 1000));
        this._syncRestFromEndAt();
        this.persistirProgreso();
        // Solo actualizar reloj, no recrear botones (evita perder toques)
        if (this.restLeft > 0) this._updateRestUI();
        else this.renderSesion();
      };
      const btnMinus30 = side.createEl("button", { text: "−30 s", cls: "ln-btn ln-btn-ghost" });
      const btnMinus15 = side.createEl("button", { text: "−15 s", cls: "ln-btn ln-btn-ghost" });
      const btnPlus15 = side.createEl("button", { text: "+15 s", cls: "ln-btn ln-btn-ghost" });
      const btnPlus30 = side.createEl("button", { text: "+30 s", cls: "ln-btn ln-btn-ghost" });
      btnMinus30.onclick = () => adjust(-30);
      btnMinus15.onclick = () => adjust(-15);
      btnPlus15.onclick = () => adjust(15);
      btnPlus30.onclick = () => adjust(30);

      const btnSkip = side.createEl("button", { text: "Saltar", cls: "ln-btn ln-btn-ghost ln-rest-action" });
      const go = rest.createEl("button", { text: "Continuar", cls: "ln-btn-go ln-rest-action" });
      // pointerup es más fiable en iOS que click cuando hay re-renders cercanos
      let restActionLock = false;
      const doTerminar = (e) => {
        if (e) {
          try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        }
        if (restActionLock) return;
        restActionLock = true;
        this.terminarDescanso();
      };
      btnSkip.addEventListener("pointerup", doTerminar);
      go.addEventListener("pointerup", doTerminar);
      btnSkip.addEventListener("click", doTerminar);
      go.addEventListener("click", doTerminar);

      rest.createEl("p", {
        text: "Descansa. El tiempo sigue aunque minimices. Pantalla encendida solo durante el descanso.",
        cls: "ln-rest-hint",
      });
      return;
    }

    // Progreso ejercicios
    const progress = el.createDiv({ cls: "ln-progress" });
    this.sesion.ejercicios.forEach((_, i) => {
      const dot = progress.createDiv({ cls: "ln-dot" + (i === this.ejIdx ? " on" : "") + (this.ejCompleto(i) ? " done" : "") });
      dot.onclick = () => {
        this.ejIdx = i;
        this.renderSesion();
      };
    });
    // En modo libre: botón + en la barra de progreso para añadir ejercicio
    if (this.esLibre) {
      const addDot = progress.createEl("button", { text: "+", cls: "ln-dot ln-dot-add", attr: { "aria-label": "Añadir ejercicio" } });
      addDot.onclick = () => this.agregarEjercicioLibre();
    }

    // Sin ejercicios aún (modo libre al empezar)
    if (!this.sesion.ejercicios.length) {
      const empty = el.createDiv({ cls: "ln-libre-empty" });
      empty.createEl("div", { text: "Entrenamiento libre", cls: "ln-libre-empty-title" });
      empty.createEl("p", {
        text: "Ve añadiendo ejercicios a medida que los haces. No hace falta una rutina previa.",
        cls: "ln-muted",
      });
      const addFirst = empty.createEl("button", {
        text: "+ Añadir primer ejercicio",
        cls: "ln-btn ln-btn-primary ln-btn-lg",
      });
      addFirst.onclick = () => this.agregarEjercicioLibre();
      return;
    }

    const ej = this.sesion.ejercicios[this.ejIdx];
    if (!ej) return;

    // Nombre ejercicio (editable en modo libre)
    const ejHead = el.createDiv({ cls: "ln-ej-head" });
    if (this.esLibre) {
      const nameWrap = ejHead.createDiv({ cls: "ln-ej-name-edit" });
      const nameIn = nameWrap.createEl("input", {
        type: "text",
        cls: "ln-input ln-ej-name-input",
        value: ej.nombre,
        attr: {
          placeholder: "Nombre del ejercicio…",
          enterkeyhint: "done",
          autocomplete: "off",
        },
      });
      nameIn.oninput = () => {
        ej.nombre = nameIn.value;
        this._mostrarSugerenciasSesion(nameIn, ej, nameIn.value);
      };
      nameIn.onfocus = () => {
        this._mostrarSugerenciasSesion(nameIn, ej, nameIn.value);
      };
      nameIn.onblur = () => {
        // delay para permitir click en sugerencia
        setTimeout(() => this._ocultarSugerenciasSesion(), 180);
        this.persistirProgreso();
      };
      nameIn.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Si hay sugerencias, tomar la primera
          if (this._sugerenciasEl) {
            const first = this._sugerenciasEl.querySelector(".ln-sugerencias-item");
            if (first) {
              first.click();
              return;
            }
          }
          nameIn.blur();
        }
      });
      // Botón elegir de la BD
      const pickBd = ejHead.createEl("button", {
        text: "📚",
        cls: "ln-icon-btn",
        attr: { "aria-label": "Elegir de la base de ejercicios", title: "Elegir de la base" },
      });
      pickBd.onclick = () => {
        new ElegirEjercicioModal(this.app, this.plugin, (nombre) => {
          ej.nombre = nombre;
          this.persistirProgreso();
          this.renderSesion();
        }).open();
      };
    } else {
      const titleRow = ejHead.createDiv({ cls: "ln-ej-title-row" });
      titleRow.createEl("h2", { text: ej.nombre });
      const maxH = this._maxPesoDe(ej.nombre);
      if (maxH > 0) {
        titleRow.createEl("span", {
          text: "Máx " + this._fmtPlaceholderPeso(maxH) + " " + (this.unidad || "kg"),
          cls: "ln-max-badge",
        });
      }
    }
    const navEj = ejHead.createDiv({ cls: "ln-ej-nav" });
    const prevEj = navEj.createEl("button", { text: "‹", cls: "ln-icon-btn", attr: { disabled: this.ejIdx === 0 ? "true" : null } });
    prevEj.onclick = () => {
      if (this.ejIdx > 0) {
        this.ejIdx--;
        this.renderSesion();
      }
    };
    const nextEj = navEj.createEl("button", { text: "›", cls: "ln-icon-btn", attr: { disabled: this.ejIdx >= this.sesion.ejercicios.length - 1 ? "true" : null } });
    nextEj.onclick = () => {
      if (this.ejIdx < this.sesion.ejercicios.length - 1) {
        this.ejIdx++;
        this.renderSesion();
      }
    };

    // Badge de superserie (en serie con el siguiente o con el anterior)
    const ejs = this.sesion.ejercicios;
    const esInicioSS = !!ej.superserie && this.ejIdx < ejs.length - 1;
    const esFinSS = this.ejIdx > 0 && !!ejs[this.ejIdx - 1].superserie;
    if (esInicioSS || esFinSS) {
      const badge = el.createDiv({ cls: "ln-ss-badge" });
      if (esInicioSS) {
        badge.createEl("span", { text: "🔗 SUPERSERIE", cls: "ln-ss-tag" });
        badge.createEl("span", {
          text: "con " + (ejs[this.ejIdx + 1].nombre || "siguiente"),
          cls: "ln-ss-pair",
        });
      } else {
        badge.createEl("span", { text: "🔗 SUPERSERIE", cls: "ln-ss-tag" });
        badge.createEl("span", {
          text: "con " + (ejs[this.ejIdx - 1].nombre || "anterior"),
          cls: "ln-ss-pair",
        });
      }
    }

    // Interruptor de unidad (kg ↔ lbs)
    const unitBar = el.createDiv({ cls: "ln-unit-bar" });
    unitBar.createEl("span", { text: "Unidad", cls: "ln-unit-bar-label" });
    const unitToggle = unitBar.createDiv({ cls: "ln-unit-toggle" });
    const btnKg = unitToggle.createEl("button", {
      text: "KG",
      cls: "ln-unit-btn" + (this.unidad === "kg" ? " active" : ""),
    });
    const btnLb = unitToggle.createEl("button", {
      text: "LB",
      cls: "ln-unit-btn" + (this.unidad === "lbs" ? " active" : ""),
    });
    const cambiarUnidad = async (to) => {
      const dest = lnNormUnidad(to);
      if (dest === this.unidad) return;
      const from = this.unidad;
      // Convertir todos los pesos de la sesión actual
      this.sesion.ejercicios.forEach((ej) => {
        ej.sets.forEach((s) => {
          if (s.peso !== "" && s.peso != null) {
            s.peso = lnConvertPeso(s.peso, from, dest);
          }
        });
      });
      this.unidad = dest;
      this.sesion.unidad = dest;
      this.plugin.settings.unidadPeso = dest;
      try { await this.plugin.saveSettings(); } catch (_) {}
      try { await this._cargarMaxPesos(); } catch (_) {}
      this.renderSesion();
    };
    btnKg.onclick = () => cambiarUnidad("kg");
    btnLb.onclick = () => cambiarUnidad("lbs");

    // Series
    const setsBox = el.createDiv({ cls: "ln-sets" });
    const cols = setsBox.createDiv({ cls: "ln-sets-header" });
    cols.createEl("span", { text: "#" });
    cols.createEl("span", { text: lnUnidadLabel(this.unidad) });
    cols.createEl("span", { text: "REPS" });
    cols.createEl("span", { text: "" });

    ej.sets.forEach((set, i) => {
      const row = setsBox.createDiv({ cls: "ln-set-row" + (set.hecho ? " done" : "") + (set.saltada ? " skipped" : "") });
      row.createEl("span", { text: String(i + 1), cls: "ln-set-num" });

      const maxHist = this._maxPesoDe(ej.nombre);
      const phPeso = this._fmtPlaceholderPeso(maxHist);
      const pesoIn = row.createEl("input", {
        type: "number",
        cls: "ln-input" + (maxHist > 0 && (set.peso === "" || set.peso == null) ? " ln-peso-hint" : ""),
        value: set.peso,
        attr: { inputmode: "decimal", placeholder: phPeso, step: "any" },
      });
      pesoIn.oninput = () => {
        set.peso = pesoIn.value;
        if (pesoIn.value !== "") pesoIn.classList.remove("ln-peso-hint");
        else if (maxHist > 0) pesoIn.classList.add("ln-peso-hint");
      };
      pesoIn.onblur = () => this.persistirProgreso();

      const esFallo = set.reps === "∞" || set.reps === "inf" || set.reps === "al fallo";
      const repsWrap = row.createDiv({ cls: "ln-reps-wrap" });
      const repsIn = repsWrap.createEl("input", {
        type: "text",
        cls: "ln-input" + (esFallo ? " ln-reps-fallo" : ""),
        value: esFallo ? "∞" : (set.reps || ""),
        attr: { inputmode: "numeric", placeholder: "0", enterkeyhint: "done" },
      });
      repsIn.oninput = () => {
        const v = repsIn.value.trim();
        if (v === "∞" || v.toLowerCase() === "inf" || v.toLowerCase() === "fallo") {
          set.reps = "∞";
          repsIn.value = "∞";
          repsIn.classList.add("ln-reps-fallo");
          falloBtn.classList.add("on");
        } else {
          set.reps = v;
          repsIn.classList.remove("ln-reps-fallo");
          falloBtn.classList.remove("on");
        }
      };
      repsIn.onblur = () => this.persistirProgreso();

      // Botón ∞ = repeticiones al fallo
      const falloBtn = repsWrap.createEl("button", {
        text: "∞",
        cls: "ln-fallo-btn" + (esFallo ? " on" : ""),
        attr: { "aria-label": "Al fallo", title: "Repeticiones al fallo" },
      });
      falloBtn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (set.reps === "∞") {
          set.reps = "";
          repsIn.value = "";
          repsIn.classList.remove("ln-reps-fallo");
          falloBtn.classList.remove("on");
        } else {
          set.reps = "∞";
          repsIn.value = "∞";
          repsIn.classList.add("ln-reps-fallo");
          falloBtn.classList.add("on");
        }
        this.persistirProgreso();
      };

      const check = row.createEl("button", { cls: "ln-check-btn" + (set.hecho ? " on" : ""), attr: { "aria-label": "Marcar serie" } });
      check.innerHTML = set.hecho ? "✓" : "○";
      check.onclick = () => {
        set.hecho = !set.hecho;
        set.saltada = false;
        if (set.hecho) {
          // Detectar PR (peso mayor al máximo histórico)
          const pesoNum = parseFloat(set.peso);
          const maxH = this._maxPesoDe(ej.nombre);
          if (!isNaN(pesoNum) && pesoNum > 0 && maxH > 0 && pesoNum > maxH + 0.05) {
            try {
              new Notice("🏆 ¡PR! " + (ej.nombre || "Ejercicio") + " → " + pesoNum + " " + (this.unidad || "kg"), 4000);
            } catch (_) {}
            // Actualizar max local para no repetir el aviso en series siguientes
            const key = (ej.nombre || "").toLowerCase().replace(/\s+/g, " ").trim();
            if (key) this.maxPesos[key] = pesoNum;
          }
          this.iniciarDescanso(ej.descanso);
        }
        this.persistirProgreso();
        this.renderSesion();
      };
    });

    // Añadir serie (copia peso y reps de la última)
    const addSet = el.createEl("button", { text: "+ Añadir serie", cls: "ln-btn ln-btn-ghost ln-btn-sm" });
    addSet.onclick = () => {
      const last = ej.sets[ej.sets.length - 1];
      ej.sets.push({
        peso: last ? last.peso : "",
        reps: last ? last.reps : "",
        hecho: false,
        saltada: false
      });
      this.persistirProgreso();
      this.renderSesion();
    };

    // Modo libre: añadir otro ejercicio / quitar este
    if (this.esLibre) {
      const libreActions = el.createDiv({ cls: "ln-libre-actions" });
      const addEj = libreActions.createEl("button", {
        text: "+ Añadir ejercicio",
        cls: "ln-btn ln-btn-primary ln-btn-block",
      });
      addEj.onclick = () => this.agregarEjercicioLibre();

      if (this.sesion.ejercicios.length > 1) {
        const rmEj = libreActions.createEl("button", {
          text: "Quitar este ejercicio",
          cls: "ln-btn ln-btn-ghost ln-btn-block ln-btn-danger-text",
        });
        rmEj.onclick = () => {
          this.sesion.ejercicios.splice(this.ejIdx, 1);
          if (this.ejIdx >= this.sesion.ejercicios.length) {
            this.ejIdx = Math.max(0, this.sesion.ejercicios.length - 1);
          }
          this.renderSesion();
        };
      }
    }
  }

  /** Info de la última serie marcada como hecha (para la tarjeta de descanso). */
  getLastCompletedSetInfo() {
    const ejercicios = this.sesion.ejercicios || [];
    for (let i = this.ejIdx; i >= 0; i--) {
      const ej = ejercicios[i];
      if (!ej) continue;
      for (let s = (ej.sets || []).length - 1; s >= 0; s--) {
        if (ej.sets[s].hecho) {
          const set = ej.sets[s];
          const unidad = this.unidad || "kg";
          const peso = set.peso !== "" && set.peso != null ? String(set.peso) : "—";
          const rawReps = set.reps !== "" && set.reps != null ? String(set.reps) : "—";
          const esFallo = rawReps === "∞" || rawReps === "inf" || rawReps.toLowerCase() === "al fallo";
          const reps = esFallo ? "∞" : rawReps;
          return {
            nombre: ej.nombre || "Ejercicio",
            serie: s + 1,
            total: ej.sets.length,
            peso,
            reps,
            unidad,
            textoPesoReps: esFallo
              ? `${peso} ${unidad} × ∞ al fallo`
              : `${peso} ${unidad} × ${reps} reps`,
          };
        }
      }
    }
    return null;
  }

  /** Info de la próxima serie pendiente (mismo o siguiente ejercicio) */
  getNextSetInfo() {
    const ejercicios = this.sesion.ejercicios;
    // Primero busca en el ejercicio actual una serie sin hacer
    for (let i = this.ejIdx; i < ejercicios.length; i++) {
      const ej = ejercicios[i];
      for (let s = 0; s < ej.sets.length; s++) {
        if (!ej.sets[s].hecho && !ej.sets[s].saltada) {
          return { nombre: ej.nombre, serie: s + 1, total: ej.sets.length, ejIdx: i };
        }
      }
    }
    return null;
  }

  terminarDescanso() {
    this.restLeft = 0;
    this.restEndAt = 0;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    // Apagar wake lock: solo se usa durante el descanso
    window._lnSessionActiva = false;
    try { lnReleaseWakeLock(); } catch (_) {}
    this.persistirProgreso();
    this.renderSesion();
  }

  ejCompleto(i) {
    const ej = this.sesion.ejercicios[i];
    return ej && ej.sets.every((s) => s.hecho || s.saltada);
  }

  iniciarDescanso(seg) {
    if (this.timerId) clearInterval(this.timerId);
    const total = seg || this.plugin.settings.descansoDefault || 90;
    this.restTotal = total;
    this.restLeft = total;
    // Timestamp absoluto: el tiempo sigue corriendo aunque la app esté minimizada
    this.restEndAt = Date.now() + total * 1000;
    this.persistirProgreso();
    this.renderSesion();

    // Pantalla encendida + permiso de notificaciones (pide una vez)
    window._lnSessionActiva = true;
    lnBindWakeLockVisibility();
    lnRequestWakeLock();
    lnEnsureNotifPermission();

    // Desbloquear audio/voz en iOS con interacción del usuario (el check)
    try {
      lnGetAudio();
      if (window.speechSynthesis) {
        const warm = new SpeechSynthesisUtterance("");
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
        window.speechSynthesis.cancel();
      }
    } catch (_) {}

    // Últimos segundos hablados (evita repetir)
    const lastSpokenRef = { v: -1 };

    this.timerId = setInterval(() => {
      this._tickRest(lastSpokenRef);
    }, 250);
  }

  fmtTime(s, human) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (human) {
      if (m <= 0) return `${sec} s`;
      if (sec === 0) return m === 1 ? "1 min" : `${m} min`;
      return `${m} min y ${sec} s`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  async terminar() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.restEndAt = 0;
    this.restLeft = 0;
    window._lnSessionActiva = false;
    try { await lnReleaseWakeLock(); } catch (_) {}

    // En modo libre: limpiar ejercicios sin nombre o sin series hechas
    if (this.esLibre) {
      this.sesion.ejercicios = this.sesion.ejercicios
        .map((ej) => ({
          ...ej,
          nombre: (ej.nombre || "").trim(),
          sets: (ej.sets || []).filter((s) => s.hecho || (s.peso !== "" && s.reps !== "")),
        }))
        .filter((ej) => ej.nombre && ej.sets.length > 0);

      // Si el usuario marcó series, asegurar hecho=true para que se guarden
      this.sesion.ejercicios.forEach((ej) => {
        ej.sets.forEach((s) => {
          if (s.peso !== "" || s.reps !== "") s.hecho = true;
        });
      });

      if (!this.sesion.ejercicios.length) {
        new Notice("Añade al menos un ejercicio con series antes de terminar");
        this.renderSesion();
        return;
      }
    }

    const fin = Date.now();
    this.sesion.fin = horaAhora();
    this.sesion.duracionMin = Math.round((fin - this.inicio) / 60000);
    await this.plugin.guardarSesion(this.sesion);

    // Auto-asignar el nombre de la rutina al día de hoy si no tiene
    const fecha = this.sesion.fecha;
    if (!this.plugin.settings.asignaciones) this.plugin.settings.asignaciones = {};
    if (!this.plugin.settings.asignaciones[fecha]) {
      this.plugin.settings.asignaciones[fecha] = this.sesion.rutina;
    }

    // Guardar nombres nuevos en la base de ejercicios
    try {
      for (const ej of this.sesion.ejercicios || []) {
        await this.plugin.agregarABdEjercicios(ej.nombre);
      }
    } catch (_) {}

    // Limpiar sesión en curso
    this.plugin.settings.sesionActiva = null;
    await this.plugin.saveSettings();

    new Notice("Sesión guardada");
    this.close();
    await this.plugin.refreshView();
  }
}

// ── Modal crear / editar rutina ─────────────────────────────────────────────
class RutinaModal extends Modal {
  constructor(app, plugin, rutina, path) {
    super(app);
    this.plugin = plugin;
    this.path = path;
    this.rutina = rutina
      ? JSON.parse(JSON.stringify(rutina))
      : {
          nombre: "",
          tipo: "planificada",
          ejercicios: [{ nombre: "", series: 3, reps: "8-12", peso: "", descanso: 90, notas: "", superserie: false }],
        };
    this.nombresEjercicios = [];
    this._sugerenciasEl = null;
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ln-form-modal");
    contentEl.empty();
    contentEl.addClass("ln-form");

    // Cargar nombres de ejercicios ya registrados (historial + rutinas)
    await this.cargarNombresEjercicios();

    // Botones ARRIBA (no los tapa el teclado del iPhone)
    const actions = contentEl.createDiv({ cls: "ln-form-actions ln-form-actions-top" });
    const cancel = actions.createEl("button", { text: "Cancelar", cls: "ln-btn ln-btn-ghost" });
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", { text: "Guardar", cls: "ln-btn ln-btn-primary" });
    save.onclick = async () => {
      if (!this.rutina.nombre.trim()) {
        new Notice("Ponle un nombre a la rutina");
        return;
      }
      // Limpiar ejercicios sin nombre
      this.rutina.ejercicios = this.rutina.ejercicios.filter((ej) => (ej.nombre || "").trim());
      if (!this.rutina.ejercicios.length) {
        new Notice("Agrega al menos un ejercicio");
        return;
      }
      await this.plugin.guardarRutina(this.rutina, this.path);
      new Notice("Rutina guardada · cambios permanentes");
      this.close();
      await this.plugin.refreshView();
    };

    // Contenedor scrollable (fixa el problema de no poder deslizar en iPhone)
    const body = contentEl.createDiv({ cls: "ln-form-body" });
    this.bodyEl = body;

    body.createEl("h2", { text: this.path ? "Editar rutina" : "Nueva rutina" });
    body.createEl("p", {
      text: "Los cambios se aplican a futuras sesiones. Toca el nombre del ejercicio para ver el menú de los que ya registraste.",
      cls: "ln-muted",
    });

    new Setting(body).setName("Nombre de la rutina").addText((t) => {
      t.setValue(this.rutina.nombre).onChange((v) => (this.rutina.nombre = v));
    });

    this.ejsBox = body.createDiv({ cls: "ln-ejs-box" });
    this.renderEjs();

    const add = body.createEl("button", { text: "+ Añadir ejercicio", cls: "ln-btn ln-btn-ghost ln-btn-block" });
    add.style.marginTop = "8px";
    add.onclick = () => {
      this.ocultarSugerencias();
      this.rutina.ejercicios.push({ nombre: "", series: 3, reps: "8-12", peso: "", descanso: 90, notas: "", superserie: false });
      this.renderEjs();
    };

    // Borrar rutina completa (solo si ya existe)
    if (this.path) {
      const delRutina = body.createEl("button", {
        text: "Borrar esta rutina",
        cls: "ln-btn ln-btn-danger ln-btn-sm",
      });
      delRutina.style.marginTop = "16px";
      delRutina.onclick = async () => {
        await this.plugin.borrarRutina({ nombre: this.rutina.nombre, path: this.path });
        this.close();
      };
    }

    // Cerrar sugerencias al tocar fuera
    contentEl.addEventListener("click", (e) => {
      if (!e.target.closest(".ln-ej-name-wrap") && !e.target.closest(".ln-sugerencias-drop")) {
        this.ocultarSugerencias();
      }
    });
  }

  async cargarNombresEjercicios() {
    const set = new Set();
    (this.plugin.settings.bdEjercicios || []).forEach((item) => {
      const n = lnNombreEj(item);
      if (n) set.add(n);
    });
    try {
      const data = await this.plugin.indexarEjerciciosHistorial();
      (data.ejercicios || []).forEach((e) => {
        if (e.nombre) set.add(e.nombre.trim());
      });
    } catch (_) {}
    try {
      const rutinas = await this.plugin.listarRutinas();
      for (const r of rutinas) {
        (r.ejercicios || []).forEach((ej) => {
          if (ej.nombre) set.add(ej.nombre.trim());
        });
      }
    } catch (_) {}
    this.nombresEjercicios = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  ocultarSugerencias() {
    if (this._sugerenciasEl) {
      this._sugerenciasEl.remove();
      this._sugerenciasEl = null;
    }
  }

  mostrarSugerencias(input, ej, filtro) {
    this.ocultarSugerencias();
    const q = (filtro || "").trim().toLowerCase();
    let lista = this.nombresEjercicios;
    if (q) {
      lista = lista.filter((n) => n.toLowerCase().includes(q));
    }
    lista = lista.slice(0, 10);

    const drop = document.createElement("div");
    drop.className = "ln-sugerencias-drop";

    if (lista.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ln-sugerencias-empty";
      empty.textContent = q
        ? "No hay coincidencias · escribe uno nuevo"
        : "Aún no hay ejercicios registrados · escribe el nombre";
      drop.appendChild(empty);
    } else {
      lista.forEach((nombre) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ln-sugerencias-item";
        item.textContent = nombre;
        item.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ej.nombre = nombre;
          input.value = nombre;
          input.blur();
          this.ocultarSugerencias();
        };
        drop.appendChild(item);
      });
    }

    const wrap = input.parentElement;
    wrap.style.position = "relative";
    wrap.appendChild(drop);
    this._sugerenciasEl = drop;

    setTimeout(() => {
      drop.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  renderEjs() {
    this.ejsBox.empty();
    this.ocultarSugerencias();

    const ejs = this.rutina.ejercicios;
    ejs.forEach((ej, i) => {
      const esInicioSS = !!ej.superserie && i < ejs.length - 1;
      const esFinSS = i > 0 && !!ejs[i - 1].superserie;

      // Conector visual entre ejercicios en superserie
      if (esFinSS) {
        const link = this.ejsBox.createDiv({ cls: "ln-ss-link" });
        link.createEl("span", { text: "🔗 EN SERIE", cls: "ln-ss-link-tag" });
        const pairName = (ejs[i - 1].nombre || "Ejercicio anterior").trim();
        const thisName = (ej.nombre || "Este ejercicio").trim();
        link.createEl("span", {
          text: pairName + "  ↔  " + thisName,
          cls: "ln-ss-link-names",
        });
      }

      const card = this.ejsBox.createDiv({
        cls: "ln-ej-card" + (esInicioSS || esFinSS ? " ln-ej-card-ss" : ""),
      });

      // Nombre con menú desplegable de ejercicios ya registrados
      const nameWrap = card.createDiv({ cls: "ln-ej-name-wrap" });
      const labelRow = nameWrap.createDiv({ cls: "ln-ej-label-row" });
      labelRow.createEl("label", { text: `Ejercicio ${i + 1}`, cls: "ln-label" });
      if (esInicioSS || esFinSS) {
        labelRow.createEl("span", { text: "🔗 EN SERIE", cls: "ln-ss-mini-badge" });
      }
      const nameInput = nameWrap.createEl("input", {
        type: "text",
        cls: "ln-input",
        attr: {
          placeholder: "Toca para ver ejercicios o escribe uno nuevo…",
          autocomplete: "off",
          enterkeyhint: "done",
        },
        value: ej.nombre || "",
      });
      nameInput.oninput = () => {
        ej.nombre = nameInput.value;
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
      };
      nameInput.onfocus = () => {
        this.mostrarSugerencias(nameInput, ej, nameInput.value);
      };
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Si hay sugerencias, tomar la primera
          if (this._sugerenciasEl) {
            const first = this._sugerenciasEl.querySelector(".ln-sugerencias-item");
            if (first && !nameInput.value.trim()) {
              first.click();
              return;
            }
          }
          nameInput.blur();
          this.ocultarSugerencias();
        }
      });

      new Setting(card).setName("Series").addText((t) => {
        t.setValue(String(ej.series || 3)).onChange((v) => (ej.series = parseInt(v, 10) || 3));
      });
      new Setting(card).setName("Reps").addText((t) => {
        t.setValue(ej.reps || "8-12").onChange((v) => (ej.reps = v));
      });
      new Setting(card).setName("Peso sugerido").addText((t) => {
        t.setValue(ej.peso || "").onChange((v) => (ej.peso = v));
      });
      new Setting(card).setName("Descanso (seg)").addText((t) => {
        t.setValue(String(ej.descanso || 90)).onChange((v) => (ej.descanso = parseInt(v, 10) || 90));
      });

      // Superserie: marcar para hacer este ejercicio en serie con el siguiente
      // Solo tiene sentido si no es el último ejercicio
      if (i < ejs.length - 1) {
        new Setting(card)
          .setName("🔗 Superserie")
          .setDesc("Hacer este ejercicio + el de abajo en serie (sin descanso entre ellos)")
          .addToggle((tg) => {
            tg.setValue(!!ej.superserie).onChange((v) => {
              ej.superserie = !!v;
              this.renderEjs(); // refresca el conector visual
            });
          });
      } else if (esFinSS) {
        // Último de un par: aviso informativo
        const info = card.createDiv({ cls: "ln-ss-info" });
        info.setText("Este ejercicio forma parte de una superserie con el de arriba");
      }

      if (this.rutina.ejercicios.length > 1) {
        const del = card.createEl("button", { text: "Eliminar ejercicio", cls: "ln-btn ln-btn-ghost ln-btn-sm" });
        del.onclick = () => {
          this.rutina.ejercicios.splice(i, 1);
          this.renderEjs();
        };
      }
    });
  }

  onClose() {
    this.ocultarSugerencias();
    this.contentEl.empty();
  }
}

// ── Plugin principal ────────────────────────────────────────────────────────
module.exports = class LiftnotePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign(
      {
        carpetaRutinas: "Entrenamiento/Rutinas",
        carpetaHistorial: "Entrenamiento/Historial",
        carpetaPlantillas: "Entrenamiento/Plantillas",
        unidadPeso: "kg",
        descansoDefault: 90,
        asignaciones: {}, // { "2026-10-23": "Pecho y tríceps", ... }
        seedHecho: false,
        opcionesRapidas: ["Pecho y tríceps", "Espalda y bíceps", "Piernas", "Hombros", "Full Body", "Push", "Pull", "Descanso"],
        sesionActiva: null, // progreso de entrenamiento en curso (sobrevive minimizar / cerrar app)
        bdEjercicios: [], // base de nombres de ejercicios reutilizables
        nombresReparados: false,
      },
      await this.loadData()
    );
    if (!Array.isArray(this.settings.bdEjercicios)) this.settings.bdEjercicios = [];

    // Migrar bdEjercicios: strings → { nombre, grupo } + inferir grupo si falta
    let migradoBd = false;
    this.settings.bdEjercicios = this.settings.bdEjercicios.map((item) => {
      if (typeof item === "string") {
        migradoBd = true;
        const nombre = item.trim();
        const grupo = lnInferirGrupo(nombre);
        return { nombre, grupo, icon: lnInferirIcono(nombre, grupo) };
      }
      if (item && typeof item === "object") {
        const nombre = lnNombreEj(item);
        let grupo = lnGrupoEj(item);
        if (!grupo && nombre) {
          grupo = lnInferirGrupo(nombre);
          if (grupo) migradoBd = true;
        }
        let icon = (item.icon || "").trim();
        if (!icon) {
          icon = lnInferirIcono(nombre, grupo);
          migradoBd = true;
        }
        return { nombre, grupo: grupo || "", icon };
      }
      return item;
    }).filter((x) => x && x.nombre);
    // Deduplicar por nombre (case-insensitive)
    const seenBd = new Set();
    this.settings.bdEjercicios = this.settings.bdEjercicios.filter((x) => {
      const k = x.nombre.toLowerCase();
      if (seenBd.has(k)) return false;
      seenBd.add(k);
      return true;
    });
    this.settings.bdEjercicios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (migradoBd) {
      await this.saveSettings();
    }

    await this.ensureFolders();

    // Migrar asignaciones de descanso/enfermo que aún no tienen archivo en historial
    await this.migrarDiasEspeciales();

    // Reparar nombres de archivo corruptos (ΓÇö, emojis rotos) sin tocar el contenido
    try {
      await this.repararNombresHistorial();
    } catch (_) {}

    this.registerView(VIEW_TYPE, (leaf) => new LiftnoteView(leaf, this));

    this.addRibbonIcon("dumbbell", "Liftnote", () => this.activarVista());

    this.addCommand({
      id: "abrir-liftnote",
      name: "Abrir Liftnote",
      callback: () => this.activarVista(),
    });

    this.addCommand({
      id: "nueva-rutina",
      name: "Nueva rutina",
      callback: () => this.crearRutina(),
    });

    // Plantillas de ejemplo la primera vez
    await this.seedPlantillas();
  }

  /** Crea archivos de historial para días de descanso/enfermo ya asignados */
  async migrarDiasEspeciales() {
    const asigs = this.settings.asignaciones || {};
    for (const [fecha, nombre] of Object.entries(asigs)) {
      const tipo = tipoDiaEspecial(nombre);
      if (tipo) {
        try {
          await this.guardarDiaEspecial(fecha, nombre, tipo);
        } catch (_) {}
      }
    }
  }

  async onunload() {}

  async ensureFolders() {
    for (const f of [this.settings.carpetaRutinas, this.settings.carpetaHistorial, this.settings.carpetaPlantillas]) {
      if (!(await this.app.vault.adapter.exists(f))) {
        await this.app.vault.createFolder(f);
      }
    }
  }

  async seedPlantillas() {
    // Solo sembrar una vez en la vida del plugin. Si el usuario borra todo, no volver a crear.
    if (this.settings.seedHecho) return;

    const folder = this.settings.carpetaRutinas;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\") || f.path === folder);
    if (files.length > 0) {
      this.settings.seedHecho = true;
      await this.saveSettings();
      return;
    }

    const ejemplos = [
      {
        nombre: "Full Body",
        tipo: "planificada",
        ejercicios: [
          { nombre: "Sentadilla", series: 4, reps: "6-8", peso: "", descanso: 120, notas: "" },
          { nombre: "Press banca", series: 4, reps: "8-10", peso: "", descanso: 90, notas: "" },
          { nombre: "Remo con barra", series: 3, reps: "8-10", peso: "", descanso: 90, notas: "" },
          { nombre: "Press militar", series: 3, reps: "8-12", peso: "", descanso: 90, notas: "" },
          { nombre: "Peso muerto rumano", series: 3, reps: "8-10", peso: "", descanso: 120, notas: "" },
        ],
      },
      {
        nombre: "Push",
        tipo: "planificada",
        ejercicios: [
          { nombre: "Press banca", series: 4, reps: "6-8", peso: "", descanso: 120, notas: "" },
          { nombre: "Press inclinado mancuernas", series: 3, reps: "8-12", peso: "", descanso: 90, notas: "" },
          { nombre: "Press militar", series: 3, reps: "8-10", peso: "", descanso: 90, notas: "" },
          { nombre: "Elevaciones laterales", series: 3, reps: "12-15", peso: "", descanso: 60, notas: "" },
          { nombre: "Fondos", series: 3, reps: "8-12", peso: "", descanso: 90, notas: "" },
          { nombre: "Extensiones de tríceps", series: 3, reps: "10-12", peso: "", descanso: 60, notas: "" },
        ],
      },
    ];

    for (const r of ejemplos) {
      await this.guardarRutina(r, null);
    }
    this.settings.seedHecho = true;
    await this.saveSettings();
  }

  async activarVista() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      // Abrir en el área principal (pantalla completa en iPhone), no en panel lateral
      leaf = workspace.getLeaf("tab");
      // Fallback por si la API no soporta "tab" en alguna versión
      if (!leaf) leaf = workspace.getLeaf(true);
      if (!leaf) leaf = workspace.getMostRecentLeaf() || workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    } else {
      // Si ya existía en un panel lateral, moverlo al área principal
      try {
        const mainLeaf = workspace.getLeaf("tab") || workspace.getMostRecentLeaf();
        if (mainLeaf && mainLeaf !== leaf) {
          await mainLeaf.setViewState({ type: VIEW_TYPE, active: true });
          leaf = mainLeaf;
        }
      } catch (_) {}
    }
    workspace.revealLeaf(leaf);
    // En móvil forzar que el leaf ocupe el centro
    try {
      workspace.setActiveLeaf(leaf, { focus: true });
    } catch (_) {
      try { workspace.setActiveLeaf(leaf, true); } catch (_) {}
    }
  }

  async refreshView() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => {
      if (l.view && l.view.render) l.view.render();
    });
  }

  async listarRutinas() {
    const folder = this.settings.carpetaRutinas;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"));
    const out = [];
    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const r = parseRutinaMD(text);
        r.path = f.path;
        r.nombre = r.nombre || f.basename;
        out.push(r);
      } catch (_) {}
    }
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async listarHistorial(limit = 10) {
    const folder = this.settings.carpetaHistorial;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit);
    const out = [];
    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const { data } = parseFrontmatter(text);
        out.push({
          nombre: data.rutina || f.basename,
          fecha: data.fecha || "",
          duracionMin: data.duracion_min || "",
          path: f.path,
        });
      } catch (_) {}
    }
    return out;
  }

  /** Devuelve todas las sesiones completadas de una fecha (YYYY-MM-DD) */
  async obtenerSesionesPorFecha(fecha) {
    const folder = this.settings.carpetaHistorial;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"));
    const out = [];
    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const { data, body } = parseFrontmatter(text);
        if (data.fecha === fecha) {
          out.push({
            nombre: (data.rutina || f.basename).trim(),
            fecha: data.fecha || "",
            inicio: data.inicio || "",
            fin: data.fin || "",
            duracionMin: data.duracion_min || "",
            unidad: data.unidad || "kg",
            body: body || "",
            path: f.path,
          });
        }
      } catch (_) {}
    }
    // Más reciente primero
    return out.sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
  }

  // Calcula volumen total (peso × reps) por día a partir del historial
  // Convierte todo a la unidad actual de settings para que sea comparable
  async calcularVolumenPorDia() {
    const folder = this.settings.carpetaHistorial;
    const destU = lnNormUnidad(this.settings.unidadPeso || "kg");
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"));
    const vol = {};
    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const { data, body } = parseFrontmatter(text);
        const fecha = data.fecha;
        if (!fecha) continue;
        const fileU = lnNormUnidad(data.unidad || "kg");
        let total = 0;
        const re = /Serie\s+\d+:\s*([\d.]+)\s*(kg|lbs|lb)?\s*[×x]\s*(\d+)\s*reps/gi;
        let m;
        while ((m = re.exec(body)) !== null) {
          let peso = parseFloat(m[1]);
          const lineU = lnNormUnidad(m[2] || fileU);
          if (lineU !== destU) {
            peso = parseFloat(lnConvertPeso(peso, lineU, destU)) || 0;
          }
          total += peso * parseInt(m[3], 10);
        }
        vol[fecha] = (vol[fecha] || 0) + total;
      } catch (_) {}
    }
    return vol;
  }

  // Progresión por ejercicio y mes (min/max peso de series hechas)
  async calcularProgresionEjercicios() {
    const folder = this.settings.carpetaHistorial;
    const unidad = this.settings.unidadPeso || "kg";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"));

    // ejMap[nombreNormalizado] = { nombre, porMes: { "2026-07": {min, max} } }
    const ejMap = {};
    const mesSet = new Set();

    const reSerie = /Serie\s+\d+:\s*([\d.]+)\s*(kg|lbs|lb)?\s*[×x]\s*(\d+)\s*reps/gi;
    const reHeading = /^##\s+(.+)$/gm;

    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const { data, body } = parseFrontmatter(text);
        const fecha = data.fecha;
        if (!fecha || fecha.length < 7) continue;
        const mesKey = fecha.slice(0, 7); // YYYY-MM
        mesSet.add(mesKey);

        // Split by ## exercise headings
        const parts = body.split(/^##\s+/m).filter(Boolean);
        for (const part of parts) {
          const nl = part.indexOf("\n");
          const nombreRaw = (nl >= 0 ? part.slice(0, nl) : part).trim();
          if (!nombreRaw || nombreRaw.toLowerCase().startsWith("notas")) continue;
          const bloque = nl >= 0 ? part.slice(nl) : "";
          const pesos = [];
          let m;
          reSerie.lastIndex = 0;
          const fileU = lnNormUnidad(data.unidad || "kg");
          while ((m = reSerie.exec(bloque)) !== null) {
            let p = parseFloat(m[1]);
            // m[0] may include unit; extract from full match if present
            const um = /([\d.]+)\s*(kg|lbs|lb)?/i.exec(m[0]);
            const lineU = lnNormUnidad((um && um[2]) || fileU);
            if (!isNaN(p) && p > 0) {
              if (lineU !== lnNormUnidad(unidad)) {
                p = parseFloat(lnConvertPeso(p, lineU, unidad)) || p;
              }
              pesos.push(p);
            }
          }
          if (!pesos.length) continue;

          const key = nombreRaw.toLowerCase().replace(/\s+/g, " ").trim();
          if (!ejMap[key]) {
            ejMap[key] = { nombre: nombreRaw, porMes: {} };
          }
          const min = Math.min(...pesos);
          const max = Math.max(...pesos);
          const prev = ejMap[key].porMes[mesKey];
          if (!prev) {
            ejMap[key].porMes[mesKey] = { min, max };
          } else {
            prev.min = Math.min(prev.min, min);
            prev.max = Math.max(prev.max, max);
          }
        }
      } catch (_) {}
    }

    const mesNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const meses = [...mesSet]
      .sort()
      .slice(-6) // últimos 6 meses
      .map((key) => {
        const [y, mo] = key.split("-");
        const label = `${mesNames[parseInt(mo, 10) - 1]} ${String(y).slice(2)}`;
        return { key, label };
      });

    const ejercicios = Object.values(ejMap).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es")
    );

    return { ejercicios, meses, unidad };
  }

  abrirSelectorRutina() {
    new SelectorRutinaModal(this.app, this).open();
  }

  abrirBuscadorEjercicios() {
    new BuscadorEjerciciosModal(this.app, this).open();
  }

  abrirBdEjercicios() {
    new BdEjerciciosModal(this.app, this).open();
  }

  /** Añade un nombre a la BD si no existe (sin avisar). Opcional: grupo muscular. */
  async agregarABdEjercicios(nombre, grupo) {
    const n = (nombre || "").trim();
    if (!n) return false;
    if (!Array.isArray(this.settings.bdEjercicios)) this.settings.bdEjercicios = [];
    const existe = this.settings.bdEjercicios.some((x) => lnNombreEj(x).toLowerCase() === n.toLowerCase());
    if (existe) return false;
    const g = (grupo || lnInferirGrupo(n) || "").trim();
    const icon = lnInferirIcono(n, g);
    this.settings.bdEjercicios.push({ nombre: n, grupo: g, icon });
    this.settings.bdEjercicios.sort((a, b) => lnNombreEj(a).localeCompare(lnNombreEj(b), "es"));
    await this.saveSettings();
    return true;
  }

  /**
   * Indexa todos los ejercicios del historial con:
   * - nombre, maxPeso, mejorSerie (peso × reps), historial reciente
   */
  async indexarEjerciciosHistorial() {
    const folder = this.settings.carpetaHistorial;
    const destU = lnNormUnidad(this.settings.unidadPeso || "kg");
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);

    const reSerie = /Serie\s+\d+:\s*([\d.]+)\s*(kg|lbs|lb)?\s*[×x]\s*(\d+)\s*reps/gi;
    // key → { nombre, maxPeso, mejorSerie: {peso, reps, fecha}, sesiones: [{fecha, series:[{peso,reps}]}] }
    const map = {};

    for (const f of files) {
      try {
        const text = await this.app.vault.read(f);
        const { data, body } = parseFrontmatter(text);
        const fecha = data.fecha || "";
        const fileU = lnNormUnidad(data.unidad || "kg");
        const parts = body.split(/^##\s+/m).filter(Boolean);

        for (const part of parts) {
          const nl = part.indexOf("\n");
          const nombreRaw = (nl >= 0 ? part.slice(0, nl) : part).trim();
          if (!nombreRaw || nombreRaw.toLowerCase().startsWith("notas")) continue;
          const bloque = nl >= 0 ? part.slice(nl) : "";
          const series = [];
          let m;
          reSerie.lastIndex = 0;
          while ((m = reSerie.exec(bloque)) !== null) {
            let p = parseFloat(m[1]);
            const lineU = lnNormUnidad(m[2] || fileU);
            if (!isNaN(p) && p > 0) {
              if (lineU !== destU) p = parseFloat(lnConvertPeso(p, lineU, destU)) || p;
              series.push({ peso: p, reps: parseInt(m[3], 10) || 0 });
            }
          }
          if (!series.length) continue;

          const key = nombreRaw.toLowerCase().replace(/\s+/g, " ").trim();
          if (!map[key]) {
            map[key] = {
              nombre: nombreRaw,
              maxPeso: 0,
              mejorSerie: null,
              sesiones: [],
            };
          }
          const entry = map[key];
          const maxHoy = Math.max(...series.map((s) => s.peso));
          if (maxHoy > entry.maxPeso) entry.maxPeso = maxHoy;

          // Mejor serie = mayor peso; empate → más reps
          for (const s of series) {
            if (
              !entry.mejorSerie ||
              s.peso > entry.mejorSerie.peso ||
              (s.peso === entry.mejorSerie.peso && s.reps > entry.mejorSerie.reps)
            ) {
              entry.mejorSerie = { peso: s.peso, reps: s.reps, fecha };
            }
          }

          // Guardar sesión (máx 12 recientes)
          if (entry.sesiones.length < 12) {
            entry.sesiones.push({
              fecha,
              series: series.map((s) => ({ ...s })),
            });
          }
        }
      } catch (_) {}
    }

    return {
      ejercicios: Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      unidad: destU,
    };
  }

  iniciarSesion(rutina) {
    const activa = this.settings.sesionActiva;
    if (activa && activa.sesion && activa.sesion.fecha === hoyISO()) {
      const nombreActiva = activa.rutinaNombre || (activa.sesion && activa.sesion.rutina) || "";
      const misma = nombreActiva === (rutina && rutina.nombre);
      if (misma || confirm(`Ya tienes un entrenamiento en curso (${nombreActiva}).\n\n¿Continuar el que está en curso?`)) {
        this.reanudarSesionActiva();
        return;
      }
      // Usuario eligió empezar de nuevo: descartar la anterior
      this.settings.sesionActiva = null;
      this.saveSettings();
    }
    new SesionModal(this.app, this, rutina).open();
  }

  /** Sesión libre: sin plantilla; vas añadiendo ejercicios mientras entrenas. */
  iniciarSesionLibre() {
    const activa = this.settings.sesionActiva;
    if (activa && activa.sesion && activa.sesion.fecha === hoyISO()) {
      if (confirm(`Ya tienes un entrenamiento en curso (${activa.rutinaNombre || activa.sesion.rutina}).\n\n¿Continuar el que está en curso?`)) {
        this.reanudarSesionActiva();
        return;
      }
      this.settings.sesionActiva = null;
      this.saveSettings();
    }
    const rutinaLibre = {
      nombre: "Entrenamiento libre",
      libre: true,
      ejercicios: [],
    };
    new SesionModal(this.app, this, rutinaLibre).open();
  }

  /** Reabre la sesión que se minimizó o quedó guardada. */
  reanudarSesionActiva() {
    const estado = this.settings.sesionActiva;
    if (!estado || !estado.sesion) {
      new Notice("No hay entrenamiento en curso");
      return;
    }
    const rutina = {
      nombre: estado.rutinaNombre || estado.sesion.rutina || "Entrenamiento",
      libre: !!estado.esLibre,
      ejercicios: (estado.sesion.ejercicios || []).map((ej) => ({
        nombre: ej.nombre,
        series: (ej.sets && ej.sets.length) || 3,
        peso: "",
        descanso: ej.descanso,
        notas: ej.notas,
        superserie: !!ej.superserie,
      })),
    };
    new SesionModal(this.app, this, rutina, estado).open();
  }

  async descartarSesionActiva() {
    if (!this.settings.sesionActiva) return;
    if (!confirm("¿Descartar el entrenamiento en curso? Se perderá el progreso no terminado.")) return;
    this.settings.sesionActiva = null;
    await this.saveSettings();
    new Notice("Entrenamiento descartado");
    await this.refreshView();
  }

  crearRutina() {
    new RutinaModal(this.app, this, null, null).open();
  }

  editarRutina(rutina) {
    new RutinaModal(this.app, this, rutina, rutina.path).open();
  }

  async borrarRutina(rutina) {
    if (!rutina || !rutina.path) {
      new Notice("No se puede borrar esta rutina");
      return;
    }
    const ok = confirm(`¿Borrar la rutina "${rutina.nombre}"?\n\nEsta acción no se puede deshacer.`);
    if (!ok) return;
    const file = this.app.vault.getAbstractFileByPath(rutina.path);
    if (file) {
      await this.app.vault.delete(file);
      new Notice(`Rutina borrada: ${rutina.nombre}`);
      await this.refreshView();
    } else {
      new Notice("No se encontró el archivo de la rutina");
    }
  }

  /**
   * Elimina la asignación del calendario y todos los archivos de historial de un día.
   * Deja la celda completamente en blanco.
   * @param {string} fecha YYYY-MM-DD
   * @param {boolean} [confirmar=true]
   * @returns {Promise<boolean>} true si se borró algo
   */
  async borrarRegistroDia(fecha, confirmar = true) {
    if (!fecha) return false;
    const sesiones = await this.obtenerSesionesPorFecha(fecha);
    const asignado = (this.settings.asignaciones || {})[fecha] || "";
    if (!asignado && sesiones.length === 0) {
      new Notice("Este día ya está en blanco");
      return false;
    }
    if (confirmar) {
      const n = sesiones.length;
      const msg = n > 0
        ? `¿Eliminar el registro de ${fecha}?\n\nSe borrará la asignación y ${n} archivo(s) de historial.\nEsta acción no se puede deshacer.`
        : `¿Quitar la asignación de ${fecha}?\n\nLa celda quedará en blanco.`;
      if (!confirm(msg)) return false;
    }
    // Borrar archivos de historial de ese día
    for (const ses of sesiones) {
      if (ses.path) {
        const file = this.app.vault.getAbstractFileByPath(ses.path);
        if (file) {
          try {
            await this.app.vault.delete(file);
          } catch (e) {
            console.error("Error borrando", ses.path, e);
          }
        }
      }
    }
    // Quitar asignación
    if (this.settings.asignaciones && this.settings.asignaciones[fecha]) {
      delete this.settings.asignaciones[fecha];
      await this.saveSettings();
    }
    new Notice("Día eliminado · celda en blanco");
    return true;
  }

  async guardarRutina(rutina, path) {
    const md = rutinaToMD(rutina);
    if (path) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file) await this.app.vault.modify(file, md);
    } else {
      const safe = lnSafeFileName(rutina.nombre, "Rutina");
      let p = `${this.settings.carpetaRutinas}/${safe}.md`;
      let n = 1;
      while (await this.app.vault.adapter.exists(p)) {
        p = `${this.settings.carpetaRutinas}/${safe}-${n}.md`;
        n++;
      }
      await this.app.vault.create(p, md);
    }
  }

  async guardarSesion(sesion) {
    const safe = lnSafeFileName(sesion.rutina, "Sesion");
    const name = `${sesion.fecha}-${safe}-${horaAhora().replace(":", "")}.md`;
    // Agrupar por mes: Entrenamiento/Historial/Octubre/archivo.md
    const mes = nombreMesES(sesion.fecha);
    const mesFolder = `${this.settings.carpetaHistorial}/${mes}`;
    if (!(await this.app.vault.adapter.exists(mesFolder))) {
      await this.app.vault.createFolder(mesFolder);
    }
    const path = `${mesFolder}/${name}`;
    await this.app.vault.create(path, sesionToMD(sesion));
  }

  /** Actualiza un archivo de historial existente (edición del día, no de la plantilla de rutina). */
  async actualizarSesion(sesion, path) {
    if (!path) {
      await this.guardarSesion(sesion);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice("No se encontró el archivo del registro");
      await this.guardarSesion(sesion);
      return;
    }
    await this.app.vault.modify(file, sesionToMD(sesion));
  }

  /**
   * Guarda un día de descanso o enfermo en el historial (sin series).
   * Evita duplicados: si ya existe un archivo para esa fecha + tipo, no crea otro.
   */
  async guardarDiaEspecial(fecha, nombre, tipo) {
    const folder = this.settings.carpetaHistorial;
    const mes = nombreMesES(fecha);
    const mesFolder = `${folder}/${mes}`;
    if (!(await this.app.vault.adapter.exists(mesFolder))) {
      await this.app.vault.createFolder(mesFolder);
    }

    // ¿Ya hay un archivo especial para este día?
    const existentes = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(mesFolder + "/") || f.path.startsWith(folder + "/"));
    for (const f of existentes) {
      try {
        const text = await this.app.vault.read(f);
        const { data } = parseFrontmatter(text);
        if (data.fecha === fecha && (data.tipo === tipo || tipoDiaEspecial(data.rutina) === tipo)) {
          // Actualizar nombre si cambió
          if (data.rutina !== nombre) {
            const nuevo = text.replace(/^rutina:\s*.+$/m, `rutina: "${nombre}"`);
            await this.app.vault.modify(f, nuevo);
          }
          return;
        }
      } catch (_) {}
    }

    const etiqueta = tipo === "enfermo" ? "Enfermo" : "Descanso";
    const emoji = tipo === "enfermo" ? "🤒" : "😴";
    // En el NOMBRE DE ARCHIVO no usamos emoji ni em dash (se corrompen en iOS/zip)
    const safe = lnSafeFileName(
      tipo === "enfermo" ? "Enfermo" : tipo === "descanso" ? "Descanso" : nombre,
      etiqueta
    );
    const name = `${fecha}-${safe}.md`;
    const path = `${mesFolder}/${name}`;

    const md = `---
rutina: "${nombre}"
fecha: ${fecha}
tipo: ${tipo}
unidad: ${lnNormUnidad(this.settings.unidadPeso || "kg") === "lbs" ? "lbs" : "kg"}
---

${emoji} **${etiqueta}**

Sin entrenamiento este día.
`;
    await this.app.vault.create(path, md);
  }

  /**
   * Repara nombres de archivo del historial ya corruptos (ΓÇö, emojis rotos, etc.).
   * NO toca el contenido de las notas: solo renombra el archivo usando fecha + rutina del frontmatter.
   * Se ejecuta una sola vez.
   */
  async repararNombresHistorial() {
    if (this.settings.nombresReparados) return;
    const folder = this.settings.carpetaHistorial;
    if (!folder) return;

    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + "/") || f.path.startsWith(folder + "\\"));

    let renombrados = 0;
    for (const f of files) {
      try {
        const base = f.name || f.path.split("/").pop() || "";
        // ¿Parece corrupto o tiene em dash / emoji en el nombre?
        let sospechoso = /ΓÇ[öô]|â€[”–]|≡|ðŸ|[\u2014\u2013]|ΓÇ|â€|╠/.test(base);
        if (!sospechoso) {
          // emoji en nombre de archivo
          try {
            sospechoso = /[\u{1F300}-\u{1FAFF}]/u.test(base);
          } catch (_) {
            sospechoso = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/.test(base);
          }
        }
        if (!sospechoso) continue;

        const text = await this.app.vault.read(f);
        const { data } = parseFrontmatter(text);
        const fecha = data.fecha || (base.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
        if (!fecha) continue;

        const tipo = data.tipo || tipoDiaEspecial(data.rutina || "");
        let etiqueta;
        if (tipo === "enfermo") etiqueta = "Enfermo";
        else if (tipo === "descanso") etiqueta = "Descanso";
        else etiqueta = lnSafeFileName(data.rutina || "Sesion", "Sesion");

        // Conservar sufijo de hora si existía (…-0830.md)
        const horaMatch = base.match(/-(\d{3,4})\.md$/i);
        const sufijoHora = horaMatch ? `-${horaMatch[1]}` : "";

        const nuevoNombre = `${fecha}-${etiqueta}${sufijoHora}.md`;
        if (nuevoNombre === base) continue;

        const dir = f.path.slice(0, f.path.length - base.length);
        let dest = dir + nuevoNombre;
        let n = 1;
        while ((await this.app.vault.adapter.exists(dest)) && dest !== f.path) {
          dest = dir + `${fecha}-${etiqueta}${sufijoHora}-${n}.md`;
          n++;
        }
        if (dest === f.path) continue;

        await this.app.vault.rename(f, dest);
        renombrados++;
      } catch (_) {}
    }

    this.settings.nombresReparados = true;
    await this.saveSettings();
    if (renombrados > 0) {
      new Notice(`Nombres de historial reparados: ${renombrados}`);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};
