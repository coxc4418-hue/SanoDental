// Sano Dental — Editor del odontograma: paleta de herramientas, dentición, índices y detalle por diente
import { esc, openModal, toast } from './utils.js';
import { icon } from './icons.js';
import { CONDITIONS, TOOLS, SURFACES, renderOdo, toothSVG, toggleSurface, toggleTooth, clearTooth, setNote, indices, odoSummary, toothName, surfaceName, cloneOdo, legendHTML } from './odontogram.js';

let currentTool = 'caries';

const toolBtn = (k) => {
  const c = CONDITIONS[k];
  const sw = c.kind === 's' ? `background:${c.fill};border-color:${c.stroke || c.color}` : `border-color:${c.color};color:${c.color}`;
  return `<button type="button" class="odo-tool ${currentTool === k ? 'on' : ''}" data-tool="${k}" title="${c.kind === 's' ? 'Toca una superficie' : 'Toca el diente'}"><i class="${c.kind === 't' ? 'tt' : ''}" style="${sw}"></i>${esc(c.label)}</button>`;
};

/** Índices y hallazgos bajo el odontograma */
export function odoStats(odo) {
  const ix = indices(odo);
  const dent = odo?.dentition || 'permanente';
  return `<div class="odo-stats">
    ${dent !== 'temporal' ? `<span class="badge badge-info" title="Cariados + Perdidos + Obturados (permanentes)">CPO-D <b>${ix.cpo}</b> (C ${ix.C} · P ${ix.P} · O ${ix.O})</span>` : ''}
    ${dent !== 'permanente' ? `<span class="badge badge-violet" title="cariados + extracción indicada + obturados (temporales)">ceo-d <b>${ix.ceo}</b></span>` : ''}
    <span class="badge ${ix.caries ? 'badge-danger' : 'badge-success'}">${ix.caries} con caries</span>
    <span class="badge ${ix.pending ? 'badge-warning' : 'badge-neutral'}">${ix.pending} por tratar</span>
    <span class="badge badge-neutral">${ix.present} presentes · ${ix.missing} ausentes</span>
  </div>`;
}
export function findingsList(odo) {
  const list = odoSummary(odo);
  if (!list.length) return '<p class="small muted" style="margin:0">Sin hallazgos registrados: boca sana o aún sin examinar.</p>';
  return `<div class="odo-findings">${list.map((f) => `<div class="odo-find ${f.pending ? 'pend' : ''}"><b>${f.n}</b><span>${esc(f.text)}</span></div>`).join('')}</div>`;
}

/**
 * Monta el editor sobre `el`. odo se modifica en el lugar; onChange(odo) se llama tras cada cambio.
 * opts: { readOnly, selected:Set, onTooth(n) para modo selección }
 */
export function mountOdoEditor(el, odo, { onChange = () => {}, readOnly = false, selectMode = null } = {}) {
  function render() {
    el.innerHTML = `
      ${readOnly || selectMode ? '' : `<div class="odo-toolbar">
        <div class="odo-tg"><span class="odo-tgl text-danger">Hallazgos (rojo)</span>${TOOLS[0].map(toolBtn).join('')}</div>
        <div class="odo-tg"><span class="odo-tgl" style="color:#2563eb">Existente / realizado (azul)</span>${TOOLS[1].map(toolBtn).join('')}</div>
        <div class="odo-tg"><button type="button" class="odo-tool ${currentTool === 'erase' ? 'on' : ''}" data-tool="erase">${icon('trash')} Borrar</button><button type="button" class="odo-tool ${currentTool === 'info' ? 'on' : ''}" data-tool="info">${icon('edit')} Detalle y nota</button>
          <div class="seg seg-sm" data-dent style="margin-left:auto">${[['permanente', 'Permanente'], ['mixta', 'Mixta'], ['temporal', 'Temporal']].map(([k, l]) => `<button type="button" data-d="${k}" class="${(odo.dentition || 'permanente') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>`}
      <div class="odo-wrap">${renderOdo(odo, { interactive: !readOnly, selected: selectMode?.selected })}</div>
      ${selectMode ? '' : `${odoStats(odo)}${legendHTML()}`}`;
    if (readOnly) return;
    el.querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => { currentTool = b.dataset.tool; el.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { odo.dentition = b.dataset.d; changed(); });
    el.querySelector('[data-odo]').onclick = (e) => {
      const svg = e.target.closest('svg[data-tooth]'); if (!svg) return;
      const n = Number(svg.dataset.tooth);
      if (selectMode) { selectMode.onTooth(n); render(); return; }
      const sEl = e.target.closest('[data-s]'); const s = sEl?.dataset.s;
      const tool = currentTool;
      if (tool === 'info') { openToothModal(odo, n, changed); return; }
      if (tool === 'erase') { if (s && odo.teeth[n]?.s?.[s]) { delete odo.teeth[n].s[s]; } else clearTooth(odo, n); changed(); return; }
      const c = CONDITIONS[tool]; if (!c) return;
      if (c.kind === 's') {
        if (!s) { toast('Toca una superficie del diente (los 5 cuadros de la corona).', 'info', 2200); return; }
        toggleSurface(odo, n, s, tool);
      } else toggleTooth(odo, n, tool);
      changed();
    };
  }
  function changed() { onChange(odo); render(); }
  render();
  return { render, get odo() { return odo; } };
}

/** Ficha de un diente: todas sus condiciones, superficies y nota */
export function openToothModal(odo, n, onChange) {
  const work = cloneOdo(odo);
  const m = openModal({
    title: `Diente ${n}`, sub: esc(toothName(n)), size: 'md',
    body: '<div data-b></div>',
    footer: `<button class="btn btn-danger-soft" data-clear style="margin-right:auto">${icon('trash')} Limpiar diente</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Aplicar</button>`
  });
  const b = m.el.querySelector('[data-b]');
  const draw = () => {
    const t = work.teeth[n] || { s: {}, c: [] };
    const sConds = Object.entries(CONDITIONS).filter(([, c]) => c.kind === 's');
    const tConds = Object.entries(CONDITIONS).filter(([, c]) => c.kind === 't');
    b.innerHTML = `<div class="stack">
      <div class="tooth-big">${toothSVG(n, t, { interactive: false })}</div>
      <div class="section-title">Superficies</div>
      <div class="table-wrap"><table class="table surf-table"><tbody>${Object.keys(SURFACES).map((s) => `<tr><td class="nowrap"><b>${esc(surfaceName(n, s))}</b></td><td><div class="chips chips-wrap">${sConds.map(([k, c]) => `<button type="button" class="chip chip-xs ${t.s?.[s] === k ? 'on' : ''}" data-ss="${s}" data-k="${k}"><i class="sw" style="background:${c.fill}"></i>${esc(c.label)}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>
      <div class="section-title">Diente completo</div>
      <div class="chips chips-wrap">${tConds.map(([k, c]) => `<button type="button" class="chip chip-xs ${t.c?.includes(k) ? 'on' : ''}" data-tc="${k}" style="${t.c?.includes(k) ? '' : `color:${c.color}`}">${esc(c.label)}</button>`).join('')}</div>
      <div class="field"><label>Nota del diente</label><input class="input" data-note value="${esc(t.note || '')}" placeholder="Ej.: movilidad grado II, sensibilidad al frío, fístula vestibular…"></div>
    </div>`;
    b.querySelectorAll('[data-ss]').forEach((x) => x.onclick = () => { toggleSurface(work, n, x.dataset.ss, x.dataset.k); keepNote(); draw(); });
    b.querySelectorAll('[data-tc]').forEach((x) => x.onclick = () => { toggleTooth(work, n, x.dataset.tc); keepNote(); draw(); });
  };
  const keepNote = () => { const v = b.querySelector('[data-note]')?.value; if (v != null) setNote(work, n, v); };
  draw();
  m.el.querySelector('[data-ok]').onclick = () => { keepNote(); if (work.teeth[n]) odo.teeth[n] = work.teeth[n]; else delete odo.teeth[n]; m.close(); onChange(odo); };
  m.el.querySelector('[data-clear]').onclick = () => { delete odo.teeth[n]; m.close(); onChange(odo); };
}
