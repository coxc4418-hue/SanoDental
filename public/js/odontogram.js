// Sano Dental — Odontograma: dibujo (FDI, 5 superficies por diente), herramientas, índices y presupuesto sugerido
import { esc } from './utils.js';

// ======================================================================
// DIENTES (numeración FDI). Filas en el orden en que se ven de frente al paciente.
// ======================================================================
export const ROWS = {
  permanente: [[[18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28]], [[48, 47, 46, 45, 44, 43, 42, 41], [31, 32, 33, 34, 35, 36, 37, 38]]],
  temporal: [[[55, 54, 53, 52, 51], [61, 62, 63, 64, 65]], [[85, 84, 83, 82, 81], [71, 72, 73, 74, 75]]]
};
export const ALL_TEETH = [...ROWS.permanente.flat(2), ...ROWS.temporal.flat(2)];
export const isTemporal = (n) => Math.floor(n / 10) >= 5;
const quadrant = (n) => { const q = Math.floor(n / 10); return q > 4 ? q - 4 : q; };
export const isUpper = (n) => [1, 2].includes(quadrant(n));
/** incisivo | canino | premolar | molar */
export function toothType(n) {
  const p = n % 10;
  if (isTemporal(n)) return p <= 2 ? 'incisivo' : p === 3 ? 'canino' : 'molar';
  return p <= 2 ? 'incisivo' : p === 3 ? 'canino' : p <= 5 ? 'premolar' : 'molar';
}
const TYPE_NAME = { incisivo: 'Incisivo', canino: 'Canino', premolar: 'Premolar', molar: 'Molar' };
const POS_NAME = { 1: 'central', 2: 'lateral', 3: '', 4: 'primer', 5: 'segundo', 6: 'primer', 7: 'segundo', 8: 'tercer (cordal)' };
const Q_NAME = { 1: 'superior derecho', 2: 'superior izquierdo', 3: 'inferior izquierdo', 4: 'inferior derecho' };
export function toothName(n) {
  const t = toothType(n); const p = n % 10;
  let pos = POS_NAME[p] || '';
  if (isTemporal(n) && p >= 4) pos = p === 4 ? 'primer' : 'segundo';
  const base = t === 'incisivo' ? `Incisivo ${pos}` : t === 'canino' ? 'Canino' : `${pos.charAt(0).toUpperCase() + pos.slice(1)} ${t}`;
  return `${base} ${Q_NAME[quadrant(n)]}${isTemporal(n) ? ' (temporal)' : ''}`.replace(/\s+/g, ' ').trim();
}
/** Raíces que se dibujan (y que guían el tipo de endodoncia) */
export function rootsOf(n) {
  const t = toothType(n);
  if (t === 'molar') return isUpper(n) ? 3 : 2;
  if (t === 'premolar') return n === 14 || n === 24 ? 2 : 1;
  return 1;
}
export function teethOf(dentition = 'permanente') {
  if (dentition === 'temporal') return ROWS.temporal.flat(2);
  if (dentition === 'mixta') return ALL_TEETH;
  return ROWS.permanente.flat(2);
}

// ======================================================================
// SUPERFICIES Y CONDICIONES. Rojo = hallazgo / por hacer · Azul = existente / realizado
// ======================================================================
export const SURFACES = { V: 'Vestibular', L: 'Lingual / palatino', M: 'Mesial', D: 'Distal', O: 'Oclusal / incisal' };
export const surfaceName = (n, s) => (s === 'L' ? (isUpper(n) ? 'Palatino' : 'Lingual') : s === 'O' ? (['incisivo', 'canino'].includes(toothType(n)) ? 'Incisal' : 'Oclusal') : SURFACES[s]);
export const surfLetters = (n, list = []) => list.map((s) => (s === 'O' && ['incisivo', 'canino'].includes(toothType(n)) ? 'I' : s === 'L' && isUpper(n) ? 'P' : s)).join('');

const RED = '#dc2626'; const BLUE = '#2563eb';
export const CONDITIONS = {
  // Superficie
  caries: { label: 'Caries', kind: 's', color: RED, fill: RED, pending: true, group: 'Hallazgos' },
  defectuosa: { label: 'Restauración defectuosa', kind: 's', color: RED, fill: '#93c5fd', stroke: RED, pending: true, group: 'Hallazgos' },
  resina: { label: 'Resina', kind: 's', color: BLUE, fill: BLUE, group: 'Existente' },
  amalgama: { label: 'Amalgama', kind: 's', color: '#334155', fill: '#334155', group: 'Existente' },
  ionomero: { label: 'Ionómero', kind: 's', color: '#0891b2', fill: '#22d3ee', group: 'Existente' },
  sellante: { label: 'Sellante', kind: 's', color: '#16a34a', fill: '#86efac', group: 'Existente' },
  // Diente
  extraccion: { label: 'Extracción indicada', kind: 't', color: RED, pending: true, group: 'Hallazgos', ex: 'presence' },
  endo_indicada: { label: 'Endodoncia indicada', kind: 't', color: RED, pending: true, group: 'Hallazgos', ex: 'endo' },
  corona_indicada: { label: 'Corona indicada', kind: 't', color: RED, pending: true, group: 'Hallazgos', ex: 'crown' },
  fractura: { label: 'Fractura', kind: 't', color: RED, pending: true, group: 'Hallazgos' },
  movilidad: { label: 'Movilidad', kind: 't', color: RED, group: 'Hallazgos' },
  ausente: { label: 'Ausente / extraído', kind: 't', color: BLUE, group: 'Existente', ex: 'presence' },
  endodoncia: { label: 'Endodoncia', kind: 't', color: BLUE, group: 'Existente', ex: 'endo' },
  corona: { label: 'Corona', kind: 't', color: BLUE, group: 'Existente', ex: 'crown' },
  implante: { label: 'Implante', kind: 't', color: BLUE, group: 'Existente', ex: 'presence' },
  pontico: { label: 'Póntico (puente)', kind: 't', color: BLUE, group: 'Existente', ex: 'presence' },
  carilla: { label: 'Carilla', kind: 't', color: BLUE, group: 'Existente' },
  removible: { label: 'Prótesis removible', kind: 't', color: BLUE, group: 'Existente' },
  ortodoncia: { label: 'Bracket', kind: 't', color: '#7c3aed', group: 'Existente' },
  no_erupcionado: { label: 'No erupcionado / incluido', kind: 't', color: '#64748b', group: 'Otros', ex: 'presence' }
};
export const TOOLS = [
  ['caries', 'defectuosa', 'extraccion', 'endo_indicada', 'corona_indicada', 'fractura', 'movilidad'],
  ['resina', 'amalgama', 'ionomero', 'sellante', 'ausente', 'endodoncia', 'corona', 'implante', 'pontico', 'carilla', 'removible', 'ortodoncia', 'no_erupcionado']
];

export function emptyOdo(dentition = 'permanente') { return { dentition, teeth: {}, notes: '', updatedAt: null }; }
export const cloneOdo = (o) => JSON.parse(JSON.stringify(o || emptyOdo()));
const toothRec = (odo, n) => (odo.teeth[n] ||= { s: {}, c: [], note: '' });
function tidy(odo, n) {
  const t = odo.teeth[n];
  if (t && !Object.keys(t.s || {}).length && !(t.c || []).length && !t.note) delete odo.teeth[n];
}
export function toothHas(odo, n, cond) { return !!odo?.teeth?.[n]?.c?.includes(cond); }
export function toothPending(odo, n) {
  const t = odo?.teeth?.[n]; if (!t) return false;
  return Object.values(t.s || {}).some((c) => CONDITIONS[c]?.pending) || (t.c || []).some((c) => CONDITIONS[c]?.pending);
}

/** Marca o desmarca una superficie */
export function toggleSurface(odo, n, s, cond) {
  const t = toothRec(odo, n);
  if (t.s[s] === cond) delete t.s[s]; else t.s[s] = cond;
  if ((t.c || []).some((c) => ['ausente', 'extraccion', 'implante', 'pontico'].includes(c)) && t.s[s]) t.c = t.c.filter((c) => !['ausente', 'implante', 'pontico'].includes(c));
  tidy(odo, n);
}
/** Marca o desmarca una condición del diente completo (respeta las condiciones excluyentes) */
export function toggleTooth(odo, n, cond) {
  const t = toothRec(odo, n);
  if (t.c.includes(cond)) t.c = t.c.filter((c) => c !== cond);
  else {
    const ex = CONDITIONS[cond]?.ex;
    if (ex) t.c = t.c.filter((c) => CONDITIONS[c]?.ex !== ex);
    t.c.push(cond);
    if (['ausente', 'implante', 'pontico', 'no_erupcionado'].includes(cond)) { t.s = {}; t.c = t.c.filter((c) => !['endodoncia', 'endo_indicada', 'fractura', 'movilidad', 'carilla', 'ortodoncia'].includes(c) || cond === 'implante'); }
  }
  tidy(odo, n);
}
export function clearTooth(odo, n) { delete odo.teeth[n]; }
export function setNote(odo, n, note) { const t = toothRec(odo, n); t.note = String(note || '').trim(); tidy(odo, n); }

/** Aplica al odontograma el efecto de un procedimiento realizado ({ s } o { t, rm }) */
export function applyEffect(odo, n, effect, surfaces = []) {
  if (!effect || !n) return;
  const t = toothRec(odo, n);
  if (effect.s) {
    const list = surfaces?.length ? surfaces : effect.surf || Object.keys(t.s).filter((k) => CONDITIONS[t.s[k]]?.pending);
    (list.length ? list : ['O']).forEach((s) => { t.s[s] = effect.s; });
  }
  if (effect.t) {
    const rm = effect.rm || [];
    t.c = t.c.filter((c) => !rm.includes(c));
    if (rm.includes('*')) { t.s = {}; t.c = t.c.filter((c) => !['endodoncia', 'endo_indicada', 'corona', 'corona_indicada', 'fractura', 'movilidad', 'carilla', 'ortodoncia'].includes(c)); }
    const ex = CONDITIONS[effect.t]?.ex;
    if (ex) t.c = t.c.filter((c) => CONDITIONS[c]?.ex !== ex);
    t.c.push(effect.t);
  }
  tidy(odo, n);
}

// ======================================================================
// ÍNDICES: CPO-D (permanentes) y ceo-d (temporales)
// ======================================================================
export function indices(odo) {
  const r = { C: 0, P: 0, O: 0, c: 0, e: 0, o: 0, caries: 0, pending: 0, missing: 0, present: 0 };
  const dent = odo?.dentition || 'permanente';
  for (const n of teethOf(dent)) {
    const t = odo?.teeth?.[n] || { s: {}, c: [] };
    const surf = Object.values(t.s || {});
    const cs = t.c || [];
    const tmp = isTemporal(n);
    const decayed = surf.includes('caries') || surf.includes('defectuosa');
    const lost = cs.includes('ausente') || cs.includes('implante') || cs.includes('pontico');
    const toExtract = cs.includes('extraccion');
    const filled = !decayed && (surf.some((x) => ['resina', 'amalgama', 'ionomero'].includes(x)) || cs.includes('corona'));
    if (!lost && !cs.includes('no_erupcionado')) r.present++;
    if (lost) r.missing++;
    if (decayed) r.caries++;
    if (toothPending(odo, n)) r.pending++;
    if (tmp) { if (decayed) r.c++; else if (toExtract) r.e++; else if (filled) r.o++; }
    else { if (decayed) r.C++; else if (lost || toExtract) r.P++; else if (filled) r.O++; }
  }
  r.cpo = r.C + r.P + r.O; r.ceo = r.c + r.e + r.o;
  return r;
}

/** Hallazgos en rojo traducidos a procedimientos del arancel: [{ code, tooth, surfaces, reason }] */
export function suggestPlan(odo, hasCode = () => true) {
  const out = [];
  const pick = (...codes) => codes.find((c) => hasCode(c)) || codes[0];
  for (const n of teethOf(odo?.dentition || 'permanente')) {
    const t = odo?.teeth?.[n]; if (!t) continue;
    const cs = t.c || [];
    const tmp = isTemporal(n);
    if (cs.includes('extraccion')) {
      out.push({ code: tmp ? pick('OP03', 'C01') : n % 10 === 8 ? pick('C03', 'C02') : pick('C01'), tooth: n, surfaces: [], reason: 'Extracción indicada' });
      continue;
    }
    if (cs.includes('endo_indicada')) {
      const r = rootsOf(n);
      out.push({ code: tmp ? pick('OP02', 'E01') : r >= 3 || toothType(n) === 'molar' ? pick('E03') : r === 2 ? pick('E02') : pick('E01'), tooth: n, surfaces: [], reason: 'Endodoncia indicada' });
    }
    const bad = Object.entries(t.s || {}).filter(([, c]) => CONDITIONS[c]?.pending).map(([s]) => s);
    if (bad.length && !cs.includes('corona_indicada')) {
      out.push({ code: bad.length >= 3 ? pick('O03') : bad.length === 2 ? pick('O02') : pick('O01'), tooth: n, surfaces: bad, reason: `Caries ${surfLetters(n, bad)}` });
    }
    if (cs.includes('corona_indicada')) out.push({ code: tmp ? pick('OP04', 'PR01') : pick('PR01'), tooth: n, surfaces: [], reason: 'Corona indicada' });
    if (cs.includes('fractura') && !cs.includes('corona_indicada') && !bad.length) out.push({ code: pick('O02'), tooth: n, surfaces: ['O'], reason: 'Fractura' });
  }
  return out;
}

// ======================================================================
// DIBUJO (SVG con colores fijos: se ve igual en pantalla, tema oscuro e impresión)
// ======================================================================
const W = 40; const H = 72; const X0 = 5; const S = 30;
function surfacePolys(y0) {
  const x = X0;
  return {
    top: `${x},${y0} ${x + S},${y0} ${x + 21},${y0 + 9} ${x + 9},${y0 + 9}`,
    bottom: `${x},${y0 + S} ${x + S},${y0 + S} ${x + 21},${y0 + 21} ${x + 9},${y0 + 21}`,
    left: `${x},${y0} ${x + 9},${y0 + 9} ${x + 9},${y0 + 21} ${x},${y0 + S}`,
    right: `${x + S},${y0} ${x + 21},${y0 + 9} ${x + 21},${y0 + 21} ${x + S},${y0 + S}`
  };
}
/** Superficie anatómica que corresponde a cada zona del cuadro según la ubicación del diente */
function zoneMap(n) {
  const up = isUpper(n); const q = quadrant(n);
  const mesialRight = q === 1 || q === 4; // lado derecho del paciente: el mesial mira hacia el centro (derecha del dibujo)
  return { top: up ? 'V' : 'L', bottom: up ? 'L' : 'V', left: mesialRight ? 'D' : 'M', right: mesialRight ? 'M' : 'D', center: 'O' };
}

export function toothSVG(n, rec = {}, { selected = false, interactive = true } = {}) {
  const up = isUpper(n);
  const y0 = up ? 38 : 4; // corona
  const rootBase = up ? 38 : 34; const apex = up ? 15 : 57;
  const numY = up ? 11 : 69;
  const s = rec.s || {}; const c = rec.c || [];
  const has = (k) => c.includes(k);
  const zm = zoneMap(n);
  const polys = surfacePolys(y0);
  const cf = (k) => { const cond = CONDITIONS[s[k]]; return cond ? cond.fill : '#ffffff'; };
  const cs = (k) => { const cond = CONDITIONS[s[k]]; return cond?.stroke || '#94a3b8'; };
  const pend = toothPending({ teeth: { [n]: rec } }, n);
  const opacity = has('ausente') || has('no_erupcionado') ? 0.35 : 1;
  let roots = '';
  const r = rootsOf(n);
  const rootX = r === 3 ? [[2, 10, 6], [11, 19, 15], [20, 28, 24]] : r === 2 ? [[4, 14, 8], [16, 26, 22]] : [[9, 21, 15]];
  if (has('implante')) {
    const top = Math.min(rootBase, apex); const h = Math.abs(rootBase - apex);
    roots = `<rect x="${X0 + 10}" y="${top}" width="10" height="${h}" rx="2" fill="#dbeafe" stroke="${BLUE}" stroke-width="1.5"/>` + [0.25, 0.5, 0.75].map((f) => `<line x1="${X0 + 8}" x2="${X0 + 22}" y1="${top + h * f}" y2="${top + h * f}" stroke="${BLUE}" stroke-width="1.5"/>`).join('');
  } else if (!has('pontico')) {
    roots = rootX.map(([a, b, m]) => `<polygon points="${X0 + a},${rootBase} ${X0 + b},${rootBase} ${X0 + m},${apex}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" opacity="${opacity}"/>`).join('');
    const endo = has('endodoncia') ? BLUE : has('endo_indicada') ? RED : null;
    if (endo) roots += rootX.map(([a, b, m]) => `<line x1="${X0 + (a + b) / 2}" y1="${rootBase}" x2="${X0 + m}" y2="${apex + (up ? 2 : -2)}" stroke="${endo}" stroke-width="3" stroke-linecap="round"/>`).join('');
  }
  const surf = (zone, poly) => `<polygon ${interactive ? `data-s="${zm[zone]}"` : ''} points="${poly}" fill="${cf(zm[zone])}" stroke="${cs(zm[zone])}" stroke-width="1"><title>${esc(surfaceName(n, zm[zone]))}${s[zm[zone]] ? ': ' + esc(CONDITIONS[s[zm[zone]]]?.label || '') : ''}</title></polygon>`;
  let crown = `<g opacity="${opacity}" ${has('no_erupcionado') ? 'stroke-dasharray="3 2"' : ''}>${surf('top', polys.top)}${surf('bottom', polys.bottom)}${surf('left', polys.left)}${surf('right', polys.right)}<rect ${interactive ? `data-s="${zm.center}"` : ''} x="${X0 + 9}" y="${y0 + 9}" width="12" height="12" fill="${cf('O')}" stroke="${cs('O')}" stroke-width="1"><title>${esc(surfaceName(n, 'O'))}${s.O ? ': ' + esc(CONDITIONS[s.O]?.label || '') : ''}</title></rect></g>`;
  if (has('pontico')) crown = `<rect x="${X0}" y="${y0}" width="${S}" height="${S}" fill="#dbeafe" stroke="${BLUE}" stroke-width="1.5"/><line x1="${X0 - 5}" x2="${X0 + S + 5}" y1="${y0 + 15}" y2="${y0 + 15}" stroke="${BLUE}" stroke-width="3"/>`;
  const marks = [];
  const cx = X0 + 15; const cy = y0 + 15;
  if (has('ausente') || has('extraccion')) { const col = has('extraccion') ? RED : BLUE; marks.push(`<line x1="${X0 - 1}" y1="${y0 - 1}" x2="${X0 + S + 1}" y2="${y0 + S + 1}" stroke="${col}" stroke-width="3" stroke-linecap="round"/><line x1="${X0 + S + 1}" y1="${y0 - 1}" x2="${X0 - 1}" y2="${y0 + S + 1}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`); }
  if (has('corona') || has('corona_indicada')) marks.push(`<circle cx="${cx}" cy="${cy}" r="17.5" fill="none" stroke="${has('corona') ? BLUE : RED}" stroke-width="2.5"/>`);
  if (has('fractura')) marks.push(`<polyline points="${X0 + 3},${y0 + 4} ${X0 + 12},${y0 + 13} ${X0 + 8},${y0 + 17} ${X0 + 19},${y0 + 27} ${X0 + 27},${y0 + 24}" fill="none" stroke="${RED}" stroke-width="2.4" stroke-linejoin="round"/>`);
  if (has('carilla')) { const yv = zm.top === 'V' ? y0 - 2 : y0 + S + 2; marks.push(`<line x1="${X0}" x2="${X0 + S}" y1="${yv}" y2="${yv}" stroke="${BLUE}" stroke-width="3.5" stroke-linecap="round"/>`); }
  if (has('ortodoncia')) marks.push(`<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" rx="1.5" fill="#7c3aed" opacity=".9"/><line x1="${X0 - 4}" x2="${X0 + S + 4}" y1="${cy}" y2="${cy}" stroke="#7c3aed" stroke-width="1.5"/>`);
  const label = (txt, col) => `<text x="${cx}" y="${up ? 30 : 50}" text-anchor="middle" font-size="9" font-weight="800" fill="${col}" font-family="Arial">${txt}</text>`;
  if (has('removible')) marks.push(label('PR', BLUE));
  if (has('no_erupcionado')) marks.push(label('NE', '#64748b'));
  if (has('implante')) marks.push(label('IMP', BLUE).replace(`y="${up ? 30 : 50}"`, `y="${up ? 13 : 61}"`).replace('font-size="9"', 'font-size="7"'));
  const mob = has('movilidad') ? `<text x="${W - 2}" y="${numY}" text-anchor="end" font-size="8" font-weight="800" fill="${RED}" font-family="Arial">M</text>` : '';
  const numFill = pend ? RED : rec.note ? BLUE : '#475569';
  const num = `<g>${selected ? `<rect x="${X0 + 3}" y="${numY - 10}" width="24" height="13" rx="6.5" fill="#0284c7"/>` : ''}<text x="${cx}" y="${numY}" text-anchor="middle" font-size="10.5" font-weight="${pend || selected ? 800 : 650}" fill="${selected ? '#ffffff' : numFill}" font-family="Arial">${n}</text>${mob}</g>`;
  return `<svg class="tooth${selected ? ' sel' : ''}" data-tooth="${n}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Diente ${n}"><title>${n} · ${esc(toothName(n))}${rec.note ? ' — ' + esc(rec.note) : ''}</title>${num}${roots}${crown}${marks.join('')}</svg>`;
}

/** Odontograma completo. opts: { selected: Set, interactive, compact } */
export function renderOdo(odo, opts = {}) {
  const o = odo || emptyOdo();
  const dent = o.dentition || 'permanente';
  const sel = opts.selected || new Set();
  const row = (halves, cls = '') => `<div class="odo-row ${cls}">${halves.map((h, i) => `<div class="odo-half ${i ? 'odo-l' : 'odo-r'}">${h.map((n) => toothSVG(n, o.teeth?.[n] || {}, { selected: sel.has(n), interactive: opts.interactive !== false })).join('')}</div>`).join('<span class="odo-mid"></span>')}</div>`;
  const P = ROWS.permanente; const T = ROWS.temporal;
  let rows;
  if (dent === 'temporal') rows = row(T[0], 'temp') + '<div class="odo-sep"></div>' + row(T[1], 'temp');
  else if (dent === 'mixta') rows = row(P[0]) + row(T[0], 'temp') + '<div class="odo-sep"></div>' + row(T[1], 'temp') + row(P[1]);
  else rows = row(P[0]) + '<div class="odo-sep"></div>' + row(P[1]);
  return `<div class="odo ${opts.compact ? 'odo-compact' : ''}" data-odo><div class="odo-side"><span>Derecha del paciente</span><span>Izquierda</span></div>${rows}</div>`;
}

/** Leyenda de colores y símbolos (HTML) */
export function legendHTML() {
  const sw = (k) => { const c = CONDITIONS[k]; return `<span class="odo-leg"><i style="background:${c.kind === 's' ? c.fill : 'transparent'};border-color:${c.stroke || c.color};${c.kind === 't' ? `box-shadow:inset 0 0 0 2px ${c.color}` : ''}"></i>${esc(c.label)}</span>`; };
  return `<div class="odo-legend"><b class="text-danger">Rojo:</b> hallazgo o por realizar · <b style="color:${BLUE}">Azul:</b> existente o realizado</div>`;
}

/** Texto con el detalle del odontograma (para informes e historia) */
export function odoSummary(odo) {
  const lines = [];
  for (const n of teethOf(odo?.dentition || 'permanente')) {
    const t = odo?.teeth?.[n]; if (!t) continue;
    const parts = [];
    const bySurf = {};
    Object.entries(t.s || {}).forEach(([s, c]) => { (bySurf[c] ||= []).push(s); });
    Object.entries(bySurf).forEach(([c, ss]) => parts.push(`${CONDITIONS[c]?.label || c} ${surfLetters(n, ss)}`));
    (t.c || []).forEach((c) => parts.push(CONDITIONS[c]?.label || c));
    if (t.note) parts.push(`(${t.note})`);
    if (parts.length) lines.push({ n, text: parts.join(', '), pending: toothPending(odo, n) });
  }
  return lines;
}
