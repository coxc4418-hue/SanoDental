// Sano Dental — Periodontograma: sondaje en 6 sitios, sangrado, placa, movilidad, furca y recesión
import { store } from './store.js';
import { savePerio } from './ops.js';
import { openModal, esc, toast, fmtDate, setBusy, confirmDialog } from './utils.js';
import { icon } from './icons.js';
import { ROWS, toothName } from './odontogram.js';
import { printPerio } from './docs.js';

const UPPER = [...ROWS.permanente[0][0], ...ROWS.permanente[0][1]];
const LOWER = [...ROWS.permanente[1][0], ...ROWS.permanente[1][1]];
const MOB = ['', '0', 'I', 'II', 'III'];
const FURCA = ['', 'I', 'II', 'III'];
const multiRoot = (n) => [6, 7, 8].includes(n % 10) || (Math.floor(n / 10) <= 2 && n % 10 === 4);

const blank = () => ({ pd: ['', '', '', '', '', ''], bop: [false, false, false, false, false, false], pl: [false, false], mob: '', furca: '', rec: '', missing: false });

/** Estadísticas del examen: profundidad media, % sangrado, % placa, sitios profundos */
export function perioStats(teeth = {}) {
  let sites = 0, sum = 0, bop = 0, bopSites = 0, deep = 0, severe = 0, plq = 0, plqFaces = 0, present = 0;
  for (const t of Object.values(teeth)) {
    if (!t || t.missing) continue;
    present++;
    (t.pd || []).forEach((v, i) => {
      const n = Number(v);
      if (v !== '' && v != null && !Number.isNaN(n)) { sites++; sum += n; if (n >= 4) deep++; if (n >= 6) severe++; }
      bopSites++; if (t.bop?.[i]) bop++;
    });
    (t.pl || [false, false]).forEach((x) => { plqFaces++; if (x) plq++; });
  }
  const r = (x) => Math.round(x * 10) / 10;
  return { present, sites, avg: sites ? r(sum / sites) : 0, bop: bopSites ? Math.round((bop / bopSites) * 100) : 0, plaque: plqFaces ? Math.round((plq / plqFaces) * 100) : 0, deep, severe, deepPct: sites ? Math.round((deep / sites) * 100) : 0 };
}
/** Orientación diagnóstica (no reemplaza el criterio del odontólogo) */
export function perioHint(st) {
  if (!st.sites) return '';
  if (st.severe > 0) return `Bolsas ≥ 6 mm en ${st.severe} sitio(s): compatible con periodontitis ${st.deepPct > 30 ? 'generalizada' : 'localizada'} avanzada. Considera radiografías periapicales y referir a periodoncia.`;
  if (st.deep > 0) return `Bolsas de 4-5 mm en ${st.deep} sitio(s) (${st.deepPct} %): compatible con periodontitis ${st.deepPct > 30 ? 'generalizada' : 'localizada'}. Indicado raspado y alisado radicular.`;
  if (st.bop >= 10) return `Sangrado al sondaje en ${st.bop} % de los sitios sin bolsas: compatible con gingivitis. Indicada profilaxis y refuerzo de higiene.`;
  return 'Salud periodontal: sangrado < 10 % y sin bolsas.';
}

/** Abre el periodontograma (nuevo o existente). Resuelve con el examen guardado o null. */
export function openPerio(patient, exam = null) {
  return new Promise((resolve) => {
    const teeth = {};
    for (const n of [...UPPER, ...LOWER]) teeth[n] = { ...blank(), ...(exam?.teeth?.[n] || {}) };
    // Los dientes ausentes del odontograma llegan marcados
    if (!exam) for (const [n, t] of Object.entries(patient.odontogram?.teeth || {})) if (teeth[n] && (t.c || []).some((c) => ['ausente', 'implante', 'pontico'].includes(c))) teeth[n].missing = true;
    let notes = exam?.notes || '';
    let saved = null;
    const m = openModal({
      title: exam ? `Periodontograma del ${fmtDate(exam.date)}` : 'Nuevo periodontograma', sub: esc(patient.name), size: 'xl',
      body: '<div data-b></div>',
      footer: `<span class="t-sub" style="margin-right:auto">Escribe la profundidad en mm (salta solo al siguiente sitio). Toca el punto rojo para marcar sangrado.</span>${exam ? `<button class="btn btn-secondary" data-print>${icon('print')} Imprimir</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(saved)
    });
    m.el.querySelector('.modal').classList.add('perio-modal');
    const b = m.el.querySelector('[data-b]');

    const siteCell = (n, i) => {
      const t = teeth[n]; const v = t.pd[i];
      const cls = v === '' ? '' : Number(v) >= 6 ? 'pd-sev' : Number(v) >= 4 ? 'pd-deep' : 'pd-ok';
      return `<div class="pd-site"><input class="pd-in ${cls}" data-pd="${n}|${i}" value="${esc(v)}" inputmode="numeric" maxlength="2" ${t.missing ? 'disabled' : ''}><button type="button" class="pd-bop ${t.bop[i] ? 'on' : ''}" data-bop="${n}|${i}" title="Sangrado" ${t.missing ? 'disabled' : ''}></button></div>`;
    };
    const archTable = (list, upper) => `<div class="table-wrap perio-wrap"><table class="perio-table"><thead><tr><th></th>${list.map((n) => `<th class="${teeth[n].missing ? 'miss' : ''}"><button type="button" class="pt-n" data-miss="${n}" title="${esc(toothName(n))} · tocar para marcar ausente">${n}</button></th>`).join('')}</tr></thead><tbody>
      <tr><td class="pr-l">${upper ? 'Vestibular' : 'Lingual'}</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}"><div class="pd-3">${[0, 1, 2].map((i) => siteCell(n, upper ? i : i + 3)).join('')}</div></td>`).join('')}</tr>
      <tr><td class="pr-l">${upper ? 'Palatino' : 'Vestibular'}</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}"><div class="pd-3">${[0, 1, 2].map((i) => siteCell(n, upper ? i + 3 : i)).join('')}</div></td>`).join('')}</tr>
      <tr><td class="pr-l">Placa</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}"><div class="pl-2">${[0, 1].map((i) => `<button type="button" class="pd-pl ${teeth[n].pl[i] ? 'on' : ''}" data-pl="${n}|${i}" title="${i ? 'Placa palatina/lingual' : 'Placa vestibular'}" ${teeth[n].missing ? 'disabled' : ''}></button>`).join('')}</div></td>`).join('')}</tr>
      <tr><td class="pr-l">Movilidad</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}"><select class="pd-sel" data-mob="${n}" ${teeth[n].missing ? 'disabled' : ''}>${MOB.map((x) => `<option ${teeth[n].mob === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`).join('')}</tr>
      <tr><td class="pr-l">Furca</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}">${multiRoot(n) ? `<select class="pd-sel" data-fur="${n}" ${teeth[n].missing ? 'disabled' : ''}>${FURCA.map((x) => `<option ${teeth[n].furca === x ? 'selected' : ''}>${x}</option>`).join('')}</select>` : ''}</td>`).join('')}</tr>
      <tr><td class="pr-l">Recesión</td>${list.map((n) => `<td class="${teeth[n].missing ? 'miss' : ''}"><input class="pd-in pd-rec" data-rec="${n}" value="${esc(teeth[n].rec)}" inputmode="numeric" maxlength="2" ${teeth[n].missing ? 'disabled' : ''}></td>`).join('')}</tr>
    </tbody></table></div>`;
    const statsHTML = () => {
      const st = perioStats(teeth);
      return `<div class="kpis kpis-sm perio-kpis">
        ${[['Profundidad media', st.avg + ' mm', st.avg >= 4 ? 'danger' : 'brand'], ['Sangrado (BOP)', st.bop + ' %', st.bop >= 10 ? 'danger' : 'success'], ['Índice de placa', st.plaque + ' %', st.plaque >= 20 ? 'warning' : 'success'], ['Sitios ≥ 4 mm', st.deep, st.deep ? 'warning' : 'success'], ['Sitios ≥ 6 mm', st.severe, st.severe ? 'danger' : 'success']].map(([l, v, t]) => `<div class="card kpi"><span class="kpi-label">${l}</span><div class="kpi-value text-${t}">${v}</div></div>`).join('')}
      </div>${perioHint(st) ? `<div class="vital-alert info mt">${icon('info')} ${esc(perioHint(st))}</div>` : ''}`;
    };
    const draw = () => {
      b.innerHTML = `<div class="stack">
        <div data-stats>${statsHTML()}</div>
        <div class="card stack"><div class="card-title">${icon('tooth')} Arcada superior</div>${archTable(UPPER, true)}</div>
        <div class="card stack"><div class="card-title">${icon('tooth')} Arcada inferior</div>${archTable(LOWER, false)}</div>
        <div class="card stack"><div class="card-title">${icon('edit')} Diagnóstico periodontal y plan</div><textarea class="textarea" data-notes placeholder="Ej.: Periodontitis estadio II, grado B, localizada. Plan: RAR por cuadrantes y reevaluación en 6 semanas.">${esc(notes)}</textarea></div>
      </div>`;
      bind();
    };
    const refreshStats = () => { b.querySelector('[data-stats]').innerHTML = statsHTML(); };
    const bind = () => {
      const inputs = [...b.querySelectorAll('[data-pd]')];
      inputs.forEach((el, idx) => {
        el.oninput = () => {
          el.value = el.value.replace(/[^0-9]/g, '');
          const [n, i] = el.dataset.pd.split('|');
          teeth[n].pd[+i] = el.value;
          const v = Number(el.value);
          el.className = 'pd-in ' + (el.value === '' ? '' : v >= 6 ? 'pd-sev' : v >= 4 ? 'pd-deep' : 'pd-ok');
          refreshStats();
          if (el.value.length === 1 && el.value !== '1') { const nx = inputs.slice(idx + 1).find((x) => !x.disabled); nx?.focus(); nx?.select(); }
        };
      });
      b.querySelectorAll('[data-bop]').forEach((x) => x.onclick = () => { const [n, i] = x.dataset.bop.split('|'); teeth[n].bop[+i] = !teeth[n].bop[+i]; x.classList.toggle('on', teeth[n].bop[+i]); refreshStats(); });
      b.querySelectorAll('[data-pl]').forEach((x) => x.onclick = () => { const [n, i] = x.dataset.pl.split('|'); teeth[n].pl[+i] = !teeth[n].pl[+i]; x.classList.toggle('on', teeth[n].pl[+i]); refreshStats(); });
      b.querySelectorAll('[data-mob]').forEach((x) => x.onchange = () => { teeth[x.dataset.mob].mob = x.value; });
      b.querySelectorAll('[data-fur]').forEach((x) => x.onchange = () => { teeth[x.dataset.fur].furca = x.value; });
      b.querySelectorAll('[data-rec]').forEach((x) => x.oninput = () => { x.value = x.value.replace(/[^0-9]/g, ''); teeth[x.dataset.rec].rec = x.value; });
      b.querySelectorAll('[data-miss]').forEach((x) => x.onclick = () => { const n = x.dataset.miss; notes = b.querySelector('[data-notes]').value; teeth[n].missing = !teeth[n].missing; draw(); });
      b.querySelector('[data-notes]').oninput = (e) => { notes = e.target.value; };
    };
    draw();
    const data = () => ({ teeth: Object.fromEntries(Object.entries(teeth).filter(([, t]) => t.missing || t.pd.some((x) => x !== '') || t.bop.some(Boolean) || t.pl.some(Boolean) || t.mob || t.furca || t.rec)), notes, stats: perioStats(teeth), date: exam?.date });
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const d = data();
      if (!Object.keys(d.teeth).length && !(await confirmDialog({ title: 'Periodontograma vacío', message: 'No registraste ningún sitio. ¿Guardar de todas formas?', confirmText: 'Guardar' }))) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { saved = await savePerio(patient, d, exam?.id || null); toast('Periodontograma guardado'); m.close(); }
      catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
    };
    const pr = m.el.querySelector('[data-print]'); if (pr) pr.onclick = () => printPerio(patient, { ...exam, ...data() });
  });
}

/** Lista de periodontogramas del paciente */
export async function patientPerios(patientId) {
  return (await store.listEq('perio', 'patientId', patientId).catch(() => [])).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
