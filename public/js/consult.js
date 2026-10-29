// Sano Dental — Atención odontológica: evaluación, odontograma, tratamientos, anestesia, récipe, documentos y cierre
import { store, APPT_TYPES, SEX } from './store.js';
import { saveConsultation, closeConsultation, chargeConsultation, waiveConsultation, addAddendum, discardConsultation, revokeDocument, freeSlots, DOC_KINDS, verifyUrl, itemsTotal, planTotals, finalOdontogram } from './ops.js';
import { requirePin } from './auth.js';
import { openModal, esc, usd, bs, num, toast, fmtDate, fmtDateTime, fmtTime, setBusy, confirmDialog, emptyState, shortId, debounce, todayKey, dayKey, addDays, round2, parseNum, normalize, qtyFmt, loc } from './utils.js';
import { icon } from './icons.js';
import { searchCIE, searchMeds, allergyConflict, IMAGING, LAB_GROUPS, SPECIALTIES, VITALS, taClass, vitalAlerts, ageText, ROUTES_ADMIN, FREQUENCIES, DURATIONS, POSTOP, ANESTHETICS, TECHNIQUES, maxCartridges, medicalAlerts, EXTRAORAL_TEMPLATE, INTRAORAL_TEMPLATE, HYGIENE, OCCLUSION, CONSENTS, UNIT_LABEL } from './clinical.js';
import { SURFACES, surfaceName, surfLetters, toothName, renderOdo, odoSummary } from './odontogram.js';
import { mountOdoEditor, findingsList, odoStats } from './odoui.js';
import { printRecipe, printLabOrder, printRest, printAttendance, printReport, printReferral, printConsent, printOdontogram, rxQty } from './docs.js';
import { waPatient, printReceipt, notifyLowStock } from './shared.js';
import { openPay, showPaid } from './pay.js';
import { allergyStrip } from './patient.js';
import { searchProcs, itemLabel } from './plans.js';

const TABS = [['eval', 'Evaluación', 'clipboard'], ['odo', 'Odontograma', 'tooth'], ['proc', 'Tratamientos', 'wrench'], ['rx', 'Récipe', 'pill'], ['docs', 'Documentos', 'file'], ['close', 'Cierre y cobro', 'checkCircle']];

/** Franja con las alertas médicas que importan al odontólogo */
export function alertStrip(chronic = [], allergies = []) {
  const al = medicalAlerts(chronic, allergies);
  if (!al.length) return '';
  return `<div class="med-alerts">${al.map((a) => `<div class="med-alert ${a.tone}">${icon(a.tone === 'danger' ? 'alert' : 'info')}<span><b>${esc(a.tag)}:</b> ${esc(a.text)}</span></div>`).join('')}</div>`;
}

/** Abre la atención (por id u objeto). Abierta = editable; cerrada = ficha de solo lectura con notas adicionales. */
export async function openConsultation(idOrC, { tab = 'eval' } = {}) {
  let c = typeof idOrC === 'string' ? await store.getConsult(idOrC) : idOrC;
  if (!c) { toast('No se encontró la atención.', 'warning'); return; }
  if (c.status !== 'abierta') return openConsultView(c);
  c = JSON.parse(JSON.stringify(c));
  for (const k of ['diagnoses', 'procedures', 'anesthesia', 'rx', 'labs', 'imaging', 'docs', 'charges']) if (!Array.isArray(c[k])) c[k] = [];
  if (!c.odontogram) c.odontogram = { dentition: 'permanente', teeth: {} };
  let current = tab;
  let dirty = false; let saving = null;
  let pTooth = null; let pSurfs = new Set(); let pQuery = ''; let pCharge = true;
  const patient = () => store.patient(c.patientId) || {};

  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>', dismissible: false });
  m.el.querySelector('.modal').classList.add('repair-modal', 'consult-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const timer = setInterval(() => { const el = rootEl.querySelector('[data-elapsed]'); if (el) el.textContent = elapsed(c.startedAt); }, 30000);
  const prevClose = m.close;
  m.close = async () => { clearInterval(timer); await flush(); prevClose(); };

  // ---------- Guardado automático ----------
  const status = (t, cls = '') => { const el = rootEl.querySelector('[data-save]'); if (el) { el.textContent = t; el.className = 'save-state ' + cls; } };
  const doSave = async () => {
    if (!dirty) return;
    dirty = false; status('Guardando…');
    try { const { id, ...rest } = c; saving = saveConsultation(c, rest); await saving; status('Guardado', 'ok'); }
    catch (e) { dirty = true; status('Sin guardar', 'bad'); toast(e.message, 'danger'); }
    finally { saving = null; }
  };
  const later = debounce(doSave, 900);
  const touch = () => { dirty = true; status('Cambios sin guardar…'); later(); };
  async function flush() { if (saving) await saving; if (dirty) await doSave(); }

  // ---------- Encabezado ----------
  const activePlans = () => store.patientPlans(c.patientId).filter((p) => ['presentado', 'aprobado', 'en_curso'].includes(p.status));
  function header() {
    const p = patient();
    const doctors = store.activeDoctors;
    return `<div class="rp-head">
      <div class="rp-dev"><span class="rp-icon">${icon('tooth')}</span>
        <div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(c.number)}</span><span class="badge badge-violet"><i class="dotc"></i>En atención</span><span class="badge badge-neutral">${esc(APPT_TYPES[c.type]?.label || 'Atención')}</span><span class="t-sub">${icon('clock')} <span data-elapsed>${elapsed(c.startedAt)}</span></span></div>
          <div class="rp-title ellipsis click" data-pt>${esc(c.patientName)}</div>
          <div class="small muted ellipsis">${esc([c.patientNumber, c.patientIdDoc && loc().id + ' ' + c.patientIdDoc, ageText(c.patientBirth), SEX[c.patientSex]].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="row" style="gap:6px;align-items:center">${doctors.length > 1 ? `<select class="select select-sm" data-doctor title="Odontólogo tratante">${doctors.map((d) => `<option value="${d.id}" ${d.id === c.doctorId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}<button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button></div>
      </div>
      ${allergyStrip(c.allergies, p.allergyNote)}${alertStrip(c.chronic, c.allergies)}
      ${(p.currentMeds || p.lastVisitAt || activePlans().length) ? `<div class="ctx-strip">${p.currentMeds ? `<span>${icon('pill')} ${esc(p.currentMeds)}</span>` : ''}${p.lastVisitAt ? `<span>${icon('history')} Última visita ${fmtDate(p.lastVisitAt)}${p.lastProcedures?.length ? ': ' + esc(p.lastProcedures.join(', ')) : ''}</span>` : '<span>' + icon('sparkle') + ' Primera visita</span>'}${activePlans().map((pl) => { const t = planTotals(pl); return `<span>${icon('clipboard')} ${esc(pl.number)}: ${t.done}/${t.count} · saldo ${usd(t.balance)}</span>`; }).join('')}</div>` : ''}
      <div class="tabs rp-tabs">${TABS.map(([k, l, ic]) => `<button data-tab="${k}" class="${k === current ? 'on' : ''}">${icon(ic)} ${l}${badgeFor(k)}</button>`).join('')}</div>
    </div>`;
  }
  const badgeFor = (k) => {
    const n = k === 'odo' ? c.diagnoses.length : k === 'proc' ? c.procedures.length : k === 'rx' ? c.rx.length : k === 'docs' ? c.docs.length : 0;
    return n ? ` <span class="tab-n">${n}</span>` : '';
  };
  function footer() {
    const i = TABS.findIndex(([k]) => k === current);
    return `<div class="rp-foot">
      <div class="row row-wrap"><span class="save-state ok" data-save>Guardado</span><button class="btn btn-ghost btn-sm" data-discard>${icon('trash')} Descartar</button></div>
      <div class="row row-wrap">
        ${c.rx.length ? `<button class="btn btn-secondary" data-print-rx>${icon('print')} Récipe</button>` : ''}
        ${i < TABS.length - 1 ? `<button class="btn btn-secondary" data-next>${TABS[i + 1][1]} ${icon('arrowRight')}</button>` : ''}
        <button class="btn btn-primary" data-finish>${icon('checkCircle')} Cerrar atención</button>
      </div>
    </div>`;
  }

  // ---------- 1. Evaluación ----------
  function tabEval() {
    const v = c.vitals || {};
    const ta = taClass(v.ta);
    const imgs = new Set(c.imaging); const labs = new Set(c.labs);
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card stack"><div class="card-title">${icon('clipboard')} Motivo de consulta</div>
          <textarea class="textarea" data-k="reason" placeholder="Ej.: dolor en muela inferior derecha al masticar, desde hace 3 días" style="min-height:64px">${esc(c.reason)}</textarea>
          <div class="field"><label>Enfermedad actual / anamnesis</label><textarea class="textarea" data-k="illness" placeholder="Tipo de dolor (espontáneo, provocado, nocturno), duración, desencadenantes (frío, calor, dulce), inflamación, tratamientos recibidos…" style="min-height:100px">${esc(c.illness)}</textarea></div>
        </div>
        <div class="card stack"><div class="between"><div class="card-title">${icon('user')} Examen extraoral</div><button class="btn btn-ghost btn-sm" data-tpl="extraoral">${icon('copy')} Normal</button></div>
          <textarea class="textarea" data-k="extraoral" placeholder="Simetría facial, ganglios, ATM, labios">${esc(c.extraoral)}</textarea></div>
        <div class="card stack"><div class="between"><div class="card-title">${icon('smile')} Examen intraoral</div><button class="btn btn-ghost btn-sm" data-tpl="intraoral">${icon('copy')} Normal</button></div>
          <textarea class="textarea" data-k="intraoral" placeholder="Mucosas, lengua, paladar, encías, frenillos">${esc(c.intraoral)}</textarea>
          <div class="form-grid">
            <div class="field"><label>Higiene oral</label><div class="seg seg-block">${HYGIENE.map((h) => `<button type="button" data-hy="${h}" class="${c.hygiene === h ? 'on' : ''}">${h}</button>`).join('')}</div></div>
            <div class="field"><label>Oclusión</label><select class="select" data-k="occlusion"><option value="">—</option>${OCCLUSION.map((o) => `<option ${c.occlusion === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          </div>
        </div>
      </div>
      <div class="stack">
        <div class="card stack" data-tour="vitals"><div class="card-title">${icon('pulse')} Signos vitales <span class="faint small">(antes de anestesiar)</span></div>
          <div class="vitals-form">${VITALS.map(([k, l, u, ph]) => `<label class="vf"><span>${l}</span><div class="input-group"><input class="input input-sm" data-v="${k}" value="${esc(v[k] || '')}" placeholder="${ph}" inputmode="${k === 'ta' ? 'text' : 'decimal'}"><span class="suffix">${u}</span></div></label>`).join('')}</div>
          <div class="vitals-calc" data-vcalc>${vitalsCalc(ta, vitalAlerts(v))}</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('image')} Radiografías y estudios</div>
          <div class="chips chips-wrap">${IMAGING.map((t) => `<button type="button" class="chip chip-xs ${imgs.has(t) ? 'on' : ''}" data-img="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="field"><label>Dientes a radiografiar</label><input class="input input-sm" data-xt value="${esc((c.xrayTeeth || []).join(', '))}" placeholder="Ej.: 36, 37"></div>
          <details><summary class="small bold click">Exámenes de laboratorio (prequirúrgicos)</summary>
            ${Object.entries(LAB_GROUPS).map(([g, items]) => `<div class="mt-xs"><div class="section-title">${g}</div><div class="chips chips-wrap">${items.map((t) => `<button type="button" class="chip chip-xs ${labs.has(t) ? 'on' : ''}" data-lab="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}
          </details>
          <textarea class="textarea" data-k="labNote" placeholder="Hallazgos radiográficos o indicaciones para el estudio">${esc(c.labNote)}</textarea>
        </div>
      </div>
    </div>`;
  }
  const vitalsCalc = (ta, al) => `<div class="row row-wrap" style="gap:6px">${ta ? `<span class="badge badge-${ta.tone}">TA ${ta.label}</span>` : '<span class="faint small">Registra la TA antes de usar anestésico con vasoconstrictor.</span>'}</div>
    ${al.filter((a) => a.k !== 'ta').map((a) => `<div class="vital-alert ${a.tone}">${icon('alert')} ${esc(a.text)}</div>`).join('')}`;

  // ---------- 2. Odontograma y diagnóstico ----------
  function tabOdo() {
    return `<div class="stack">
      <div class="card stack" data-tour="odo"><div class="between row-wrap"><div class="card-title">${icon('tooth')} Odontograma</div><span class="t-sub">Elige una herramienta y toca la superficie o el diente</span></div>
        <div data-odo-ed></div>
      </div>
      <div class="rp-grid">
        <div class="card stack"><div class="between row-wrap"><div class="card-title">${icon('list')} Hallazgos</div><button class="btn btn-primary btn-sm" data-mkplan>${icon('clipboard')} Crear presupuesto</button></div><div data-findings>${findingsList(c.odontogram)}</div></div>
        <div class="card stack" data-tour="dx-search"><div class="card-title">${icon('search')} Diagnóstico (CIE-10)</div>
          <div class="row" style="gap:6px"><label class="search grow">${icon('search')}<input data-cie placeholder="Caries, pulpitis, gingivitis, K04…" autocomplete="off"></label><input class="input input-sm" data-dxtooth placeholder="Diente" inputmode="numeric" style="width:76px"></div>
          <div class="list dx-results" data-cie-res></div>
          ${c.diagnoses.length ? `<div class="stack-sm">${c.diagnoses.map((d, i) => `<div class="dx-item"><span class="dx-code">${esc(d.code || '—')}</span><div class="grow" style="min-width:0"><b>${esc(d.name)}</b>${d.tooth ? ` <span class="tooth-chip">${esc(d.tooth)}</span>` : ''}<div class="row" style="gap:6px;margin-top:4px"><button class="chip chip-xs ${i === 0 ? 'on' : ''}" data-main="${i}">${i === 0 ? 'Principal' : 'Hacer principal'}</button><select class="select select-xs" data-dxtype="${i}">${['Presuntivo', 'Definitivo'].map((t) => `<option ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><button class="btn btn-ghost btn-icon btn-sm" data-dxrm="${i}">${icon('x')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Busca y toca un diagnóstico. Escribe el diente para asociarlo.</p>'}
        </div>
      </div>
    </div>`;
  }

  // ---------- 3. Tratamientos realizados hoy ----------
  function tabProc() {
    const plans = activePlans();
    const done = new Set(c.procedures.filter((x) => x.planItemId).map((x) => x.planItemId));
    const res = searchProcs(pQuery, 10);
    const after = finalOdontogram(c);
    const changes = c.procedures.filter((x) => x.tooth && (x.effect || store.proc(x.code)?.effect));
    const pesos = c.vitals?.peso || patient().lastVitals?.peso || '';
    return `<div class="rp-grid">
      <div class="stack">
        ${plans.length ? plans.map((pl) => { const t = planTotals(pl); const pend = (pl.items || []).filter((it) => it.status !== 'realizado'); return `<div class="card stack" data-tour="plan-items"><div class="between row-wrap"><div class="card-title">${icon('clipboard')} ${esc(pl.number)} · ${esc(pl.title || 'Presupuesto')}</div><span class="t-sub">${t.done}/${t.count} · saldo <b class="${t.balance > 0 ? 'text-danger' : ''}">${usd(t.balance)}</b></span></div>
          ${pend.length ? `<div class="list">${pend.map((it) => `<label class="list-item click"><span class="check"><input type="checkbox" data-pi="${pl.id}|${it.id}" ${done.has(it.id) ? 'checked' : ''}><span></span></span><span class="grow" style="min-width:0">${itemLabel(it)}<span class="t-sub">Fase ${it.phase || 1} · ${usd(it.price * (it.qty || 1))} · se cubre con el presupuesto</span></span></label>`).join('')}</div>` : '<p class="small muted" style="margin:0">Todos los tratamientos de este presupuesto ya se realizaron.</p>'}
        </div>`; }).join('') : `<div class="card">${emptyState('clipboard', 'Sin presupuesto activo', 'Arma el plan de tratamiento desde el odontograma o agrega abajo los procedimientos de hoy.')}<div class="center mt"><button class="btn btn-secondary btn-sm" data-mkplan>${icon('clipboard')} Crear presupuesto</button></div></div>`}
        <div class="card stack"><div class="card-title">${icon('plus')} Agregar procedimiento</div>
          <div class="field"><label>Diente ${pTooth ? `<b class="text-brand">${pTooth}</b> <span class="t-sub">${esc(toothName(pTooth))}</span>` : '<span class="t-sub">(toca en el odontograma o escríbelo)</span>'}</label>
            <div class="row" style="gap:6px"><input class="input input-sm" data-pt-in inputmode="numeric" value="${pTooth || ''}" placeholder="Ej.: 36" style="width:90px"><div data-odo-mini class="grow" style="min-width:0"></div></div></div>
          ${pTooth ? `<div class="row row-wrap" style="gap:6px"><span class="small muted">Superficies:</span>${Object.keys(SURFACES).map((s) => `<button type="button" class="chip chip-xs ${pSurfs.has(s) ? 'on' : ''}" data-psf="${s}">${esc(surfaceName(pTooth, s))}</button>`).join('')}</div>` : ''}
          <label class="search">${icon('search')}<input data-pq value="${esc(pQuery)}" placeholder="Resina, exodoncia, limpieza, endodoncia…" autocomplete="off"></label>
          <label class="check small"><input type="checkbox" data-pcharge ${pCharge ? 'checked' : ''}> <span>Cobrar en esta atención (desmárcalo si se cubre con un presupuesto)</span></label>
          <div class="list proc-results" data-pres>${procResults(res)}</div>
        </div>
      </div>
      <div class="stack">
        <div class="card stack" data-tour="procs"><div class="card-title">${icon('checkCircle')} Realizado hoy</div>
          ${c.procedures.length ? `<div class="stack-sm">${c.procedures.map((x, i) => `<div class="proc-line"><div class="between" style="gap:8px"><div style="min-width:0">${itemLabel(x)}<div class="t-sub">${x.planId ? 'Del presupuesto ' + esc(store.plan(x.planId)?.number || '') : x.charged ? 'Se cobra hoy · ' + usd(x.price) : 'Sin cargo'}</div></div><button class="btn btn-ghost btn-icon btn-sm" data-prm="${i}">${icon('x')}</button></div><input class="input input-sm mt-xs" data-pnote="${i}" value="${esc(x.note || '')}" placeholder="Evolución: técnica, material, observaciones…"></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Marca los tratamientos del presupuesto o agrega procedimientos.</p>'}
          ${changes.length ? `<div class="vital-alert info">${icon('tooth')} Al cerrar, el odontograma se actualiza: ${esc(changes.map((x) => `${x.tooth} ${x.name.split(' (')[0]}`).join(' · '))}</div>` : ''}
        </div>
        <div class="card stack" data-tour="anesthesia"><div class="between row-wrap"><div class="card-title">${icon('needle')} Anestesia local</div><button class="btn btn-secondary btn-sm" data-an-add>${icon('plus')} Agregar</button></div>
          ${c.anesthesia.length ? c.anesthesia.map((a, i) => anRow(a, i, pesos)).join('') : '<p class="small muted" style="margin:0">Sin anestesia registrada.</p>'}
          ${anTotal(pesos)}
        </div>
        <div class="card stack"><div class="card-title">${icon('edit')} Evolución y plan</div>
          <textarea class="textarea" data-k="plan" placeholder="Nota clínica de la sesión: lo realizado, materiales, respuesta del paciente y qué sigue en la próxima cita" style="min-height:110px">${esc(c.plan)}</textarea></div>
      </div>
    </div>`;
  }
  const procResults = (res) => res.map((p, i) => `<button type="button" class="list-item click" data-padd="${i}"><span class="dx-code">${esc(p.code || '—')}</span><span class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><span class="t-sub">${esc(p.cat || '')} · ${esc(UNIT_LABEL[p.unit] || '')}</span></span><b>${usd(p.price)}</b>${icon('plus')}</button>`).join('');
  const anRow = (a, i, peso) => {
    const def = ANESTHETICS.find((x) => x.k === a.k);
    const conf = def && allergyConflict({ name: def.name, family: 'anestesico' }, c.allergies);
    return `<div class="an-row"><div class="form-grid">
      <div class="field full"><label>Anestésico</label><select class="select select-sm" data-an="${i}" data-f="k">${ANESTHETICS.map((x) => `<option value="${x.k}" ${x.k === a.k ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Técnica</label><select class="select select-sm" data-an="${i}" data-f="technique">${TECHNIQUES.map((x) => `<option ${x === a.technique ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Cartuchos (1,8 ml)</label><div class="row" style="gap:6px"><input class="input input-sm" data-an="${i}" data-f="cartridges" inputmode="decimal" value="${esc(a.cartridges || '')}" style="width:80px"><input class="input input-sm" data-an="${i}" data-f="zone" value="${esc(a.zone || '')}" placeholder="Zona / diente"><button class="btn btn-ghost btn-icon btn-sm" data-anrm="${i}">${icon('x')}</button></div></div>
    </div>${conf ? `<div class="vital-alert danger">${icon('alert')} El paciente es alérgico a ${esc(conf)}.</div>` : ''}${def?.vaso && (c.chronic || []).some((x) => /Hipertensi|Cardiopat|tiroidismo/.test(x)) ? `<div class="vital-alert warning">${icon('alert')} Contiene vasoconstrictor: paciente con ${esc((c.chronic || []).filter((x) => /Hipertensi|Cardiopat|tiroidismo/.test(x)).join(', '))}. Máximo 2 cartuchos o usa mepivacaína 3 % sin vasoconstrictor.</div>` : ''}</div>`;
  };
  function anTotal(peso) {
    if (!c.anesthesia.length) return '';
    const parts = c.anesthesia.map((a) => { const mx = maxCartridges(a.k, peso); const used = parseNum(a.cartridges) || 0; return { mx, used, pct: mx ? used / mx : 0 }; });
    const pct = parts.reduce((s, x) => s + x.pct, 0);
    return `<div class="vital-alert ${pct > 1 ? 'danger' : pct > 0.75 ? 'warning' : 'info'}">${icon(pct > 1 ? 'alert' : 'info')} Dosis máxima para ${peso ? esc(peso) + ' kg' : '70 kg (sin peso registrado)'}: ${c.anesthesia.map((a, i) => `${parts[i].mx ?? '—'} cartuchos de ${esc(ANESTHETICS.find((x) => x.k === a.k)?.name.split(' ')[0] || '')}`).join(' · ')}. Usado: ${Math.round(pct * 100)} % de la dosis máxima.</div>`;
  }

  // ---------- 4. Récipe ----------
  function tabRx() {
    const favs = store.settings.favMeds || [];
    return `<div class="stack">
      <div class="card stack" data-tour="rx-search"><div class="between row-wrap"><div class="card-title">${icon('pill')} Agregar medicamento</div>${favs.length ? `<span class="t-sub">${icon('star')} ${favs.length} favorito(s)</span>` : ''}</div>
        <label class="search">${icon('search')}<input data-med placeholder="Amoxicilina, ibuprofeno, clorhexidina, clindamicina…" autocomplete="off"></label>
        <div class="med-results" data-med-res>${favs.length ? medResults(searchMeds('', 12, favs)) : ''}</div>
        <div class="row row-wrap" style="gap:6px"><span class="small muted">Rápidos:</span>${['Amoxicilina 500', 'Clindamicina 300', 'Ibuprofeno 600', 'Ketorolaco 10', 'Clorhexidina', 'Acetaminofén 500'].map((x) => `<button type="button" class="chip chip-xs" data-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      </div>
      ${c.rx.length ? `<div class="stack-sm">${c.rx.map((r, i) => rxLine(r, i)).join('')}</div>` : `<div class="card">${emptyState('pill', 'Récipe vacío', 'Busca un medicamento: la dosis, frecuencia y duración se llenan solas y puedes cambiarlas.')}</div>`}
      <div class="card stack"><div class="card-title">${icon('list')} Indicaciones para el paciente</div>
        <div class="row row-wrap" style="gap:6px">${Object.keys(POSTOP).map((g) => `<button type="button" class="btn btn-secondary btn-sm" data-postop="${esc(g)}">${icon('plus')} ${esc(g)}</button>`).join('')}</div>
        <textarea class="textarea" data-k="indications" placeholder="Cuidados postoperatorios, dieta, higiene, signos de alarma…" style="min-height:130px">${esc(c.indications)}</textarea>
      </div>
    </div>`;
  }
  const medResults = (list) => list.map((md, i) => {
    const conf = allergyConflict(md, c.allergies);
    return `<button type="button" class="med-opt ${conf ? 'conflict' : ''}" data-addmed="${i}">${md.fav ? icon('star') : icon('pill')}<span class="grow"><b>${esc(md.name)}</b> <span class="muted">${esc(md.presentation)}</span><small>${esc([md.dose, md.frequency, md.duration].filter(Boolean).join(' · '))}</small></span>${conf ? `<span class="badge badge-danger">${icon('alert')} Alergia: ${esc(conf)}</span>` : icon('plus')}</button>`;
  }).join('');
  function rxLine(r, i) {
    const conf = allergyConflict(r, c.allergies);
    const q = rxQty(r);
    return `<div class="card rx-line ${conf ? 'conflict' : ''}">
      <div class="between row-wrap" style="gap:8px"><div class="row" style="gap:10px;min-width:0"><span class="rx-n">${i + 1}</span><div style="min-width:0"><b class="ellipsis">${esc(r.name)}</b><div class="t-sub">${esc(r.presentation || '')}</div></div></div>
        <div class="row" style="gap:4px">${conf ? `<span class="badge badge-danger">${icon('alert')} Alérgico a ${esc(conf)}</span>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-rxfav="${i}" title="Guardar como favorito">${icon('star')}</button><button class="btn btn-ghost btn-icon btn-sm" data-rxup="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button><button class="btn btn-ghost btn-icon btn-sm" data-rxrm="${i}" title="Quitar">${icon('trash')}</button></div></div>
      <div class="rx-grid mt">
        <label class="field"><span class="lbl">Presentación</span><input class="input input-sm" data-rx="${i}" data-f="presentation" value="${esc(r.presentation || '')}"></label>
        <label class="field"><span class="lbl">Dosis</span><input class="input input-sm" data-rx="${i}" data-f="dose" value="${esc(r.dose || '')}"></label>
        <label class="field"><span class="lbl">Frecuencia</span><input class="input input-sm" data-rx="${i}" data-f="frequency" value="${esc(r.frequency || '')}" list="dl-freq"></label>
        <label class="field"><span class="lbl">Duración</span><input class="input input-sm" data-rx="${i}" data-f="duration" value="${esc(r.duration || '')}" list="dl-dur"></label>
        <label class="field"><span class="lbl">Vía</span><select class="select select-sm" data-rx="${i}" data-f="route">${ROUTES_ADMIN.map((x) => `<option ${x === (r.route || 'Oral') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Cantidad</span><input class="input input-sm" data-rx="${i}" data-f="qty" value="${esc(r.qty || '')}" placeholder="${q ? q + ' (calculada)' : 'Ej.: 1 caja'}"></label>
        <label class="field full"><span class="lbl">Nota para el paciente</span><input class="input input-sm" data-rx="${i}" data-f="note" value="${esc(r.note || '')}" placeholder="Ej.: tomar con comida, no suspender"></label>
      </div>
    </div>`;
  }

  // ---------- 5. Documentos ----------
  function tabDocs() {
    const issued = c.docs || [];
    const ref = c.referral || {};
    const card = (k, ic, title, desc, extra = '') => `<div class="card doc-card"><span class="kpi-icon tone-brand">${icon(ic)}</span><div class="grow" style="min-width:0"><b>${title}</b><div class="t-sub">${desc}</div>${extra}</div><button class="btn btn-secondary btn-sm" data-doc="${k}">${icon('print')} Imprimir</button></div>`;
    const teeth = [...new Set([...c.procedures.map((x) => x.tooth), ...c.diagnoses.map((d) => d.tooth)].filter(Boolean))];
    return `<div class="stack">
      <div class="grid-2" data-tour="docs">
        ${card('recipe', 'pill', 'Récipe e indicaciones', c.rx.length ? `${c.rx.length} medicamento(s) · ${store.settings.rxFormat === 'carta' ? 'hoja carta' : 'media carta lado a lado'}` : 'Agrega medicamentos en la pestaña Récipe')}
        ${card('consent', 'shieldCheck', 'Consentimiento informado', 'Riesgos, alternativas y firmas del paciente y del odontólogo', `<div class="row row-wrap mt-xs" style="gap:6px"><select class="select select-sm" data-consent style="width:auto">${Object.entries(CONSENTS).map(([k, x]) => `<option value="${k}" ${c.consentKind === k ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select><input class="input input-sm" data-consent-teeth value="${esc(c.consentTeeth ?? teeth.join(', '))}" placeholder="Dientes" style="width:110px"></div>`)}
        ${card('odontogram', 'tooth', 'Odontograma', 'Estado actual con hallazgos e índice CPO-D')}
        ${card('labs', 'image', 'Orden de radiografías y exámenes', c.labs.length + c.imaging.length ? `${c.imaging.length} estudio(s) de imagen · ${c.labs.length} de laboratorio` : 'Selecciona estudios en la pestaña Evaluación')}
        ${card('report', 'file', 'Informe odontológico', 'Resumen de la atención, odontograma y tratamiento')}
        ${card('attendance', 'door', 'Constancia de asistencia', 'Hora de llegada y salida, para el trabajo o el colegio', `<input class="input input-sm mt-xs" data-companion placeholder="Acompañante (opcional)">`)}
        ${card('rest', 'bed', 'Constancia de reposo', 'Tras cirugías o extracciones', `<div class="row row-wrap mt-xs" style="gap:6px"><input class="input input-sm" data-rest-days inputmode="numeric" value="${esc(c.rest?.days || 2)}" style="width:70px"><span class="small muted">días desde</span><input class="input input-sm" type="date" data-rest-from value="${esc(c.rest?.from || todayKey())}" style="width:auto"><label class="check small"><input type="checkbox" data-rest-dx ${c.rest?.includeDx === false ? '' : 'checked'}> <span>con diagnóstico</span></label></div>`)}
        ${card('referral', 'send', 'Referencia', ref.to ? `A ${esc(ref.to)}` : 'A especialista u otro profesional', `<div class="form-grid mt-xs"><input class="input input-sm" data-ref="to" value="${esc(ref.to || '')}" list="dl-spec" placeholder="Especialidad (ej.: Endodoncia)"><input class="input input-sm" data-ref="reason" value="${esc(ref.reason || '')}" placeholder="Motivo"></div>`)}
        <div class="card doc-card"><span class="kpi-icon tone-success">${icon('whatsapp')}</span><div class="grow"><b>Indicaciones por WhatsApp</b><div class="t-sub">Tratamiento, cuidados y próxima cita en un mensaje listo</div></div><button class="btn btn-whatsapp btn-sm" data-wa-ind>${icon('whatsapp')} Enviar</button></div>
      </div>
      <div class="card"><div class="card-title">${icon('qr')} Documentos emitidos</div>
        ${issued.length ? `<div class="list mt">${issued.map((d) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(DOC_KINDS[d.kind] || d.kind)}</b> ${d.revoked ? '<span class="badge badge-danger">Anulado</span>' : ''}<div class="t-sub ellipsis">${esc(d.summary || '')} · ${fmtTime(d.at)}</div></div><a class="mono small" href="${verifyUrl(d.code)}" target="_blank" rel="noopener">${esc(d.code)}</a></div>`).join('')}</div>
          <p class="hint mt">Cada documento lleva un código QR. Quien lo reciba (farmacia, empresa, colegio, laboratorio) puede comprobar que es auténtico en sano-dental.web.app/verificar.</p>` : `<p class="small muted" style="margin:8px 0 0">Aún no has impreso documentos en esta atención. Cada uno se registra con un código de verificación.</p>`}
      </div>
    </div>`;
  }

  // ---------- 6. Cierre y cobro ----------
  function tabClose() {
    const items = c.charges || [];
    const total = itemsTotal(items);
    const prods = store.products.filter((p) => p.active !== false && (Number(p.stock) || 0) > 0);
    const nv = c.nextVisit || {};
    const plans = activePlans();
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card stack" data-tour="charges"><div class="card-title">${icon('wallet')} Cargos de la atención</div>
          ${items.length ? `<div class="stack-sm">${items.map((it, i) => `<div class="charge-line"><div class="grow" style="min-width:0"><b class="ellipsis">${it.tooth ? `<span class="tooth-chip">${it.tooth}</span> ` : ''}${esc(it.name)}</b><div class="t-sub">${it.productId ? 'Material del inventario' : 'Procedimiento'}</div></div><div class="stepper"><button data-cq="${i}" data-d="-1">${icon('minus')}</button><span>${qtyFmt(it.qty)}</span><button data-cq="${i}" data-d="1">${icon('plus')}</button></div><div class="input-group" style="width:110px;flex:none"><span class="prefix">${esc(loc().sym)}</span><input class="input input-sm" data-cp="${i}" inputmode="decimal" value="${num(it.price)}"></div><button class="btn btn-ghost btn-icon btn-sm" data-crm="${i}">${icon('x')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Sin cargos: la atención se cerrará sin costo (por ejemplo, si se cubre con un presupuesto).</p>'}
          <div class="row row-wrap" style="gap:6px">
            <select class="select select-sm" data-add-svc style="flex:1;min-width:180px"><option value="">+ Agregar procedimiento…</option>${store.settings.services.map((s, i) => `<option value="${i}">${esc(s.code ? s.code + ' · ' : '')}${esc(s.name)} · ${usd(s.price)}</option>`).join('')}</select>
            ${prods.length ? `<select class="select select-sm" data-add-prod style="flex:1;min-width:180px"><option value="">+ Material usado / vendido…</option>${prods.map((p) => `<option value="${p.id}">${esc(p.name)} · ${usd(p.price)} (${qtyFmt(p.stock)})</option>`).join('')}</select>` : ''}
          </div>
          <div class="pay-total" style="margin:0"><div class="small muted">Total de la atención</div><b>${usd(total)}</b></div>
          ${plans.length ? `<div class="vital-alert info">${icon('clipboard')} ${plans.map((pl) => { const t = planTotals(pl); return `${esc(pl.number)}: saldo ${usd(t.balance)}`; }).join(' · ')}. Al cerrar podrás registrar un abono al presupuesto.</div>` : ''}
        </div>
      </div>
      <div class="stack">
        <div class="card stack" data-tour="next"><div class="card-title">${icon('calendar')} Próxima cita</div>
          <div class="chips chips-wrap">${[[2, '2 días'], [7, '1 semana'], [15, '15 días'], [30, '1 mes']].map(([d, l]) => `<button type="button" class="chip chip-xs" data-nvq="${d}">${l}</button>`).join('')}<button type="button" class="chip chip-xs" data-nvq="0">Sin cita</button></div>
          <div class="form-grid"><div class="field"><label>Tipo</label><select class="select" data-nv-type>${Object.entries(APPT_TYPES).map(([k, t]) => `<option value="${k}" ${(nv.type || (c.procedures.length || activePlans().length ? 'tratamiento' : 'control')) === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
          <div class="field"><label>Fecha</label><input class="input" type="date" data-nv-date value="${esc(nv.date || '')}" min="${todayKey()}"></div>
          <div class="field"><label>Hora</label><select class="select" data-nv-time>${nv.date ? slotOptions(nv.date, nv.time) : '<option value="">Elige la fecha</option>'}</select></div></div>
          <div class="hint" data-nv-hint>${nv.date ? 'Se agendará la cita al cerrar.' : 'Opcional. Se agenda automáticamente al cerrar.'}</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('bell')} Recordatorio de limpieza / control</div>
          <div class="chips chips-wrap">${[[3, '3 meses'], [6, '6 meses'], [12, '1 año']].map(([mm, l]) => `<button type="button" class="chip chip-xs ${c.recall === dayKey(addMonths(mm)) ? 'on' : ''}" data-rc="${mm}">${l}</button>`).join('')}<button type="button" class="chip chip-xs ${!c.recall ? 'on' : ''}" data-rc="0">Sin recordatorio</button></div>
          <div class="hint">${c.recall ? `Aparecerá en el inicio el ${fmtDate(c.recall)} para invitarlo por WhatsApp.` : 'El inicio te avisa cuándo invitar al paciente a su limpieza.'}</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('checkCircle')} Resumen</div>
          <div class="summary-box">
            <div class="summary-row"><span>Motivo</span><b class="ellipsis" style="max-width:60%">${esc(c.reason || '—')}</b></div>
            <div class="summary-row"><span>Diagnósticos</span><b>${c.diagnoses.length}</b></div>
            <div class="summary-row"><span>Tratamientos realizados</span><b>${c.procedures.length}</b></div>
            <div class="summary-row"><span>Medicamentos</span><b>${c.rx.length}</b></div>
            <div class="summary-row"><span>Documentos</span><b>${c.docs.length}</b></div>
          </div>
          ${!c.reason && !c.diagnoses.length && !c.procedures.length ? `<div class="vital-alert warning">${icon('alert')} Falta el motivo, un diagnóstico o un tratamiento.</div>` : ''}
          <button class="btn btn-success btn-lg btn-block" data-close-pay ${total > 0 ? '' : 'hidden'}>${icon('dollar')} Cerrar y cobrar ${usd(total)}</button>
          <button class="btn btn-secondary btn-block" data-close-pend ${total > 0 ? '' : 'hidden'}>${icon('clock')} Cerrar y dejar por cobrar</button>
          <button class="btn ${total > 0 ? 'btn-ghost' : 'btn-primary btn-lg'} btn-block" data-close-free>${icon('checkCircle')} ${total > 0 ? 'Cerrar sin cargo (cortesía)' : 'Cerrar atención'}</button>
        </div>
      </div>
    </div>`;
  }
  const slotOptions = (date, sel, type) => {
    const t = type || rootEl.querySelector('[data-nv-type]')?.value || 'control';
    const slots = freeSlots(date, { doctorId: c.doctorId, minutes: APPT_TYPES[t]?.minutes });
    if (sel && !slots.includes(sel)) slots.unshift(sel);
    return slots.length ? slots.map((x) => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('') : '<option value="">Sin horarios libres ese día</option>';
  };

  // ---------- Render y eventos ----------
  function render() {
    const body = { eval: tabEval, odo: tabOdo, proc: tabProc, rx: tabRx, docs: tabDocs, close: tabClose }[current]();
    rootEl.innerHTML = `${header()}<div class="rp-body">${body}</div>${footer()}
      <datalist id="dl-freq">${FREQUENCIES.map((x) => `<option value="${x}">`).join('')}</datalist><datalist id="dl-dur">${DURATIONS.map((x) => `<option value="${x}">`).join('')}</datalist><datalist id="dl-spec">${SPECIALTIES.map((x) => `<option value="${x}">`).join('')}</datalist>`;
    bind();
  }
  const rerenderKeepScroll = () => { const md = m.el.querySelector('.modal'); const st = md.scrollTop; render(); md.scrollTop = st; };

  function bind() {
    const q = (s) => rootEl.querySelector(s);
    const all = (s, fn) => rootEl.querySelectorAll(s).forEach(fn);
    q('[data-x]').onclick = () => m.close();
    q('[data-pt]').onclick = async () => { await flush(); const { openPatient } = await import('./patient.js'); openPatient(c.patientId); };
    all('[data-tab]', (b) => b.onclick = () => { current = b.dataset.tab; render(); m.el.querySelector('.modal').scrollTop = 0; });
    const nx = q('[data-next]'); if (nx) nx.onclick = () => { const i = TABS.findIndex(([k]) => k === current); current = TABS[i + 1][0]; render(); m.el.querySelector('.modal').scrollTop = 0; };
    q('[data-finish]').onclick = () => { current = 'close'; render(); };
    const ds = q('[data-doctor]'); if (ds) ds.onchange = () => { const d = store.doctor(ds.value); c.doctorId = d?.id || null; c.doctor = d?.name || ''; touch(); };
    q('[data-discard]').onclick = async () => {
      if (!(await requirePin('Descartar la atención'))) return;
      if (!(await confirmDialog({ title: 'Descartar atención', message: `Se anulará <b>${esc(c.number)}</b> y lo registrado no se guardará en la historia. ${c.appointmentId ? 'La cita vuelve a la sala de espera.' : ''}`, confirmText: 'Descartar', danger: true }))) return;
      dirty = false; await discardConsultation(c, 'Descartada por el odontólogo'); clearInterval(timer); prevClose(); toast('Atención descartada', 'warning');
    };
    const prx = q('[data-print-rx]'); if (prx) prx.onclick = () => runDoc('recipe');

    // Campos de texto y signos
    all('[data-k]', (el) => { const h = () => { c[el.dataset.k] = el.value; touch(); }; el.oninput = h; el.onchange = h; });
    all('[data-v]', (el) => el.oninput = () => {
      c.vitals = { ...c.vitals, [el.dataset.v]: el.value.trim() }; touch();
      q('[data-vcalc]').innerHTML = vitalsCalc(taClass(c.vitals.ta), vitalAlerts(c.vitals));
    });
    all('[data-tpl]', (b) => b.onclick = () => { const k = b.dataset.tpl; const t = q(`[data-k="${k}"]`); const tpl = k === 'extraoral' ? EXTRAORAL_TEMPLATE : INTRAORAL_TEMPLATE; t.value = t.value ? t.value + '\n' + tpl : tpl; c[k] = t.value; touch(); });
    all('[data-hy]', (b) => b.onclick = () => { c.hygiene = b.dataset.hy; all('[data-hy]', (x) => x.classList.toggle('on', x === b)); touch(); });
    all('[data-img]', (b) => b.onclick = () => { const t = b.dataset.img; c.imaging = c.imaging.includes(t) ? c.imaging.filter((x) => x !== t) : [...c.imaging, t]; b.classList.toggle('on'); touch(); });
    all('[data-lab]', (b) => b.onclick = () => { const t = b.dataset.lab; c.labs = c.labs.includes(t) ? c.labs.filter((x) => x !== t) : [...c.labs, t]; b.classList.toggle('on'); touch(); });
    const xt = q('[data-xt]'); if (xt) xt.oninput = () => { c.xrayTeeth = xt.value.split(/[^0-9]+/).map(Number).filter((n) => n >= 11 && n <= 85); touch(); };

    // Odontograma
    const oe = q('[data-odo-ed]');
    if (oe) mountOdoEditor(oe, c.odontogram, { onChange: () => { touch(); const f = q('[data-findings]'); if (f) f.innerHTML = findingsList(c.odontogram); } });
    all('[data-mkplan]', (b) => b.onclick = async () => {
      await flush();
      const { openPlanEditor } = await import('./plans.js');
      const pl = await openPlanEditor({ patient: patient(), odontogram: c.odontogram, consultationId: c.id });
      if (pl) { toast(`Presupuesto ${pl.number} listo. Márcalo en “Tratamientos” cuando realices cada uno.`, 'success', 4500); setTimeout(rerenderKeepScroll, 400); }
    });

    // Diagnósticos
    const cie = q('[data-cie]');
    if (cie) {
      const draw = () => {
        const v = cie.value.trim();
        const res = searchCIE(v);
        q('[data-cie-res]').innerHTML = res.map((d, i) => `<button type="button" class="list-item click dx-opt" data-dx="${i}"><span class="dx-code">${esc(d.code)}</span><span class="grow">${esc(d.name)}</span>${icon('plus')}</button>`).join('')
          + (v.length > 2 ? `<button type="button" class="list-item click dx-opt" data-dxfree><span class="dx-code">—</span><span class="grow">Agregar como texto: <b>${esc(v)}</b></span>${icon('plus')}</button>` : '');
        rootEl.querySelectorAll('[data-dx]').forEach((b) => b.onclick = () => addDx(res[+b.dataset.dx]));
        const fr = rootEl.querySelector('[data-dxfree]'); if (fr) fr.onclick = () => addDx({ code: '', name: v.charAt(0).toUpperCase() + v.slice(1) });
      };
      cie.oninput = debounce(draw, 80);
      cie.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); rootEl.querySelector('.dx-opt')?.click(); } };
    }
    const addDx = (d) => {
      const tooth = Number(q('[data-dxtooth]')?.value) || null;
      if (c.diagnoses.some((x) => x.name === d.name && (x.tooth || null) === tooth)) { toast('Ese diagnóstico ya está agregado', 'info'); return; }
      c.diagnoses.push({ code: d.code, name: d.name, tooth, type: 'Presuntivo', note: '' }); touch(); rerenderKeepScroll();
    };
    all('[data-dxrm]', (b) => b.onclick = () => { c.diagnoses.splice(+b.dataset.dxrm, 1); touch(); rerenderKeepScroll(); });
    all('[data-main]', (b) => b.onclick = () => { const i = +b.dataset.main; const [d] = c.diagnoses.splice(i, 1); c.diagnoses.unshift(d); touch(); rerenderKeepScroll(); });
    all('[data-dxtype]', (el) => el.onchange = () => { c.diagnoses[+el.dataset.dxtype].type = el.value; touch(); });

    // Tratamientos
    all('[data-pi]', (cb) => cb.onchange = () => {
      const [planId, itemId] = cb.dataset.pi.split('|');
      const pl = store.plan(planId); const it = pl?.items.find((x) => x.id === itemId);
      if (!it) return;
      if (cb.checked) c.procedures.push({ id: shortId(6), planId, planItemId: itemId, code: it.code, name: it.name, tooth: it.tooth || null, surfaces: it.surfaces || [], price: it.price, charged: false, note: '' });
      else c.procedures = c.procedures.filter((x) => x.planItemId !== itemId);
      touch(); rerenderKeepScroll();
    });
    const mini = q('[data-odo-mini]');
    if (mini) mountOdoEditor(mini, c.odontogram, { selectMode: { selected: new Set(pTooth ? [pTooth] : []), onTooth: (n) => { pTooth = pTooth === n ? null : n; pSurfs = new Set(Object.entries(c.odontogram.teeth[n]?.s || {}).filter(([, k]) => ['caries', 'defectuosa'].includes(k)).map(([s]) => s)); rerenderKeepScroll(); } } });
    const pin = q('[data-pt-in]'); if (pin) pin.onchange = () => { const n = Number(pin.value); pTooth = n >= 11 && n <= 85 ? n : null; pSurfs = new Set(); rerenderKeepScroll(); };
    all('[data-psf]', (b) => b.onclick = () => { const s = b.dataset.psf; pSurfs.has(s) ? pSurfs.delete(s) : pSurfs.add(s); b.classList.toggle('on', pSurfs.has(s)); });
    const pcg = q('[data-pcharge]'); if (pcg) pcg.onchange = () => { pCharge = pcg.checked; };
    const pq = q('[data-pq]');
    if (pq) {
      let res = searchProcs(pQuery, 10);
      const bindRes = () => rootEl.querySelectorAll('[data-padd]').forEach((b) => b.onclick = () => addProc(res[+b.dataset.padd]));
      pq.oninput = debounce(() => { pQuery = pq.value; res = searchProcs(pQuery, 10); q('[data-pres]').innerHTML = procResults(res); bindRes(); }, 80);
      bindRes();
    }
    const addProc = (p) => {
      if (['diente', 'superficie'].includes(p.unit) && !pTooth) { toast('Indica primero el diente (tócalo en el odontograma o escribe su número).', 'info', 3000); return; }
      const sf = p.unit === 'superficie' ? [...pSurfs] : [];
      let pp = p;
      if (p.unit === 'superficie' && /^O0[123]$/.test(p.code || '') && sf.length) pp = store.proc(sf.length >= 3 ? 'O03' : sf.length === 2 ? 'O02' : 'O01') || p;
      const id = shortId(6);
      const tooth = ['diente', 'superficie'].includes(p.unit) ? pTooth : null;
      c.procedures.push({ id, planId: null, planItemId: null, code: pp.code || '', name: pp.name, tooth, surfaces: sf, price: Number(pp.price) || 0, charged: pCharge, note: '' });
      if (pCharge) c.charges.push({ id: shortId(6), procId: id, productId: null, code: pp.code || '', tooth, name: pp.name + (tooth ? ` (${tooth}${sf.length ? ' ' + surfLetters(tooth, sf) : ''})` : ''), qty: 1, price: Number(pp.price) || 0, cost: 0 });
      touch(); rerenderKeepScroll(); toast(`${pp.name}${tooth ? ' · ' + tooth : ''} agregado`);
    };
    all('[data-prm]', (b) => b.onclick = () => { const [x] = c.procedures.splice(+b.dataset.prm, 1); c.charges = c.charges.filter((ch) => ch.procId !== x.id); touch(); rerenderKeepScroll(); });
    all('[data-pnote]', (el) => el.oninput = () => { c.procedures[+el.dataset.pnote].note = el.value; touch(); });
    const aa = q('[data-an-add]'); if (aa) aa.onclick = () => { const hta = (c.chronic || []).some((x) => /Hipertensi|Cardiopat/.test(x)); c.anesthesia.push({ k: hta ? 'mepi3' : 'lido_epi', technique: TECHNIQUES[0], cartridges: '1', zone: pTooth ? String(pTooth) : '' }); touch(); rerenderKeepScroll(); };
    all('[data-an]', (el) => { const h = () => { c.anesthesia[+el.dataset.an][el.dataset.f] = el.value; touch(); if (el.tagName === 'SELECT' || el.dataset.f === 'cartridges') rerenderKeepScroll(); }; el.onchange = h; if (el.tagName === 'INPUT' && el.dataset.f !== 'cartridges') el.oninput = () => { c.anesthesia[+el.dataset.an][el.dataset.f] = el.value; touch(); }; });
    all('[data-anrm]', (b) => b.onclick = () => { c.anesthesia.splice(+b.dataset.anrm, 1); touch(); rerenderKeepScroll(); });

    // Récipe
    const med = q('[data-med]');
    if (med) {
      let res = searchMeds('', 12, store.settings.favMeds || []);
      const bindRes = () => rootEl.querySelectorAll('[data-addmed]').forEach((b) => b.onclick = () => addMed(res[+b.dataset.addmed]));
      const draw = () => { res = searchMeds(med.value, 14, store.settings.favMeds || []); q('[data-med-res]').innerHTML = medResults(res); bindRes(); };
      med.oninput = debounce(draw, 80);
      med.onkeydown = (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        if (res[0] && med.value.trim()) addMed(res[0]); else if (med.value.trim()) addMed({ name: med.value.trim(), presentation: '', dose: '', frequency: '', duration: '', route: 'Oral' });
      };
      bindRes();
      all('[data-quick]', (b) => b.onclick = () => { const r = searchMeds(b.dataset.quick, 1); if (r[0]) addMed(r[0]); });
    }
    const addMed = async (md) => {
      const conf = allergyConflict(md, c.allergies);
      if (conf && !(await confirmDialog({ title: '⚠️ Posible alergia', message: `El paciente es <b>alérgico a ${esc(conf)}</b> y <b>${esc(md.name)}</b> pertenece a esa familia de medicamentos. ¿Agregarlo de todas formas?`, confirmText: 'Agregar igual', danger: true }))) return;
      if (c.rx.some((r) => normalize(r.name) === normalize(md.name) && normalize(r.presentation) === normalize(md.presentation))) { toast('Ese medicamento ya está en el récipe', 'info'); return; }
      c.rx.push({ id: shortId(6), name: md.name, presentation: md.presentation || '', dose: md.dose || '', frequency: md.frequency || '', duration: md.duration || '', route: md.route || 'Oral', family: md.family || '', qty: '', note: md.note || '' });
      touch(); rerenderKeepScroll();
      setTimeout(() => { const i = rootEl.querySelector('[data-med]'); if (i) { i.value = ''; i.focus(); } }, 30);
    };
    all('[data-rx]', (el) => { const h = () => { c.rx[+el.dataset.rx][el.dataset.f] = el.value; touch(); }; el.oninput = h; el.onchange = h; });
    all('[data-rxrm]', (b) => b.onclick = () => { c.rx.splice(+b.dataset.rxrm, 1); touch(); rerenderKeepScroll(); });
    all('[data-rxup]', (b) => b.onclick = () => { const i = +b.dataset.rxup; [c.rx[i - 1], c.rx[i]] = [c.rx[i], c.rx[i - 1]]; touch(); rerenderKeepScroll(); });
    all('[data-rxfav]', (b) => b.onclick = async () => {
      const r = c.rx[+b.dataset.rxfav];
      const favs = (store.settings.favMeds || []).filter((f) => !(normalize(f.name) === normalize(r.name) && normalize(f.presentation) === normalize(r.presentation)));
      await store.saveSettings({ favMeds: [{ name: r.name, presentation: r.presentation, dose: r.dose, frequency: r.frequency, duration: r.duration, route: r.route, family: r.family || '', note: r.note || '' }, ...favs].slice(0, 60) });
      toast(`${r.name} guardado en favoritos con esta posología`);
    });
    all('[data-postop]', (b) => b.onclick = () => {
      const t = q('[data-k="indications"]');
      const lines = POSTOP[b.dataset.postop].filter((x) => !t.value.includes(x));
      if (!lines.length) return;
      t.value = (t.value ? t.value.trimEnd() + '\n' : '') + lines.map((x) => '• ' + x).join('\n'); c.indications = t.value; touch();
    });

    // Documentos
    all('[data-doc]', (b) => b.onclick = () => runDoc(b.dataset.doc, b));
    const wi = q('[data-wa-ind]'); if (wi) wi.onclick = () => waPatient('indicaciones', { consult: c, patient: patient() });
    const rd = q('[data-rest-days]'); if (rd) { const h = () => { c.rest = { days: Math.max(1, Math.round(parseNum(rd.value)) || 1), from: q('[data-rest-from]').value || todayKey(), includeDx: q('[data-rest-dx]').checked }; touch(); }; rd.oninput = h; q('[data-rest-from]').onchange = h; q('[data-rest-dx]').onchange = h; }
    all('[data-ref]', (el) => el.oninput = () => { c.referral = { ...(c.referral || {}), [el.dataset.ref]: el.value }; touch(); });
    const cs = q('[data-consent]'); if (cs) { cs.onchange = () => { c.consentKind = cs.value; touch(); }; q('[data-consent-teeth]').oninput = (e) => { c.consentTeeth = e.target.value; touch(); }; }

    // Cierre
    all('[data-cq]', (b) => b.onclick = () => { const it = c.charges[+b.dataset.cq]; it.qty = Math.max(1, (Number(it.qty) || 1) + Number(b.dataset.d)); touch(); rerenderKeepScroll(); });
    all('[data-cp]', (el) => el.onchange = () => { c.charges[+el.dataset.cp].price = round2(parseNum(el.value)); touch(); rerenderKeepScroll(); });
    all('[data-crm]', (b) => b.onclick = () => { const [ch] = c.charges.splice(+b.dataset.crm, 1); if (ch?.procId) { const pr = c.procedures.find((x) => x.id === ch.procId); if (pr) pr.charged = false; } touch(); rerenderKeepScroll(); });
    const as = q('[data-add-svc]'); if (as) as.onchange = () => { const s = store.settings.services[+as.value]; if (s) { c.charges.push({ id: shortId(6), productId: null, code: s.code || '', name: s.name, qty: 1, price: Number(s.price) || 0, cost: 0 }); touch(); rerenderKeepScroll(); } };
    const ap = q('[data-add-prod]'); if (ap) ap.onchange = () => { const p = store.product(ap.value); if (p) { const ex = c.charges.find((x) => x.productId === p.id); if (ex) ex.qty += 1; else c.charges.push({ id: shortId(6), productId: p.id, name: p.name, qty: 1, price: p.price || 0, cost: p.cost || 0 }); touch(); rerenderKeepScroll(); } };
    all('[data-rc]', (b) => b.onclick = () => { const mm = +b.dataset.rc; c.recall = mm ? dayKey(addMonths(mm)) : null; touch(); rerenderKeepScroll(); });
    const nvd = q('[data-nv-date]');
    if (nvd) {
      const typ = () => q('[data-nv-type]').value;
      const setNv = () => { const d = nvd.value; const t = q('[data-nv-time]').value; c.nextVisit = d && t ? { date: d, time: t, type: typ(), minutes: APPT_TYPES[typ()]?.minutes } : null; q('[data-nv-hint]').textContent = c.nextVisit ? `Se agendará ${APPT_TYPES[typ()]?.label.toLowerCase()} el ${fmtDate(d)} a las ${t}.` : d ? 'Elige una hora disponible.' : 'Opcional. Se agenda automáticamente al cerrar.'; touch(); };
      nvd.onchange = () => { q('[data-nv-time]').innerHTML = nvd.value ? slotOptions(nvd.value, null, typ()) : '<option value="">Elige la fecha</option>'; setNv(); };
      q('[data-nv-time]').onchange = setNv;
      q('[data-nv-type]').onchange = () => { if (nvd.value) q('[data-nv-time]').innerHTML = slotOptions(nvd.value, null, typ()); setNv(); };
      all('[data-nvq]', (b) => b.onclick = () => {
        const d = +b.dataset.nvq;
        if (!d) { nvd.value = ''; q('[data-nv-time]').innerHTML = '<option value="">Elige la fecha</option>'; setNv(); return; }
        let day = addDays(new Date(), d);
        for (let k = 0; k < 14 && !freeSlots(dayKey(day), { doctorId: c.doctorId, minutes: APPT_TYPES[typ()]?.minutes }).length; k++) day = addDays(day, 1);
        nvd.value = dayKey(day); q('[data-nv-time]').innerHTML = slotOptions(nvd.value, null, typ()); setNv();
      });
    }
    const cp = q('[data-close-pay]'); if (cp) cp.onclick = () => finish('pay');
    const cpe = q('[data-close-pend]'); if (cpe) cpe.onclick = () => finish('pending');
    const cf = q('[data-close-free]'); if (cf) cf.onclick = () => finish('free');
  }

  async function runDoc(kind, btn = null) {
    await flush();
    if (btn) setBusy(btn, true);
    try {
      const p = patient();
      if (kind === 'recipe') await printRecipe(c);
      if (kind === 'labs') await printLabOrder(c);
      if (kind === 'rest') await printRest(c, c.rest || { days: 2, from: todayKey(), includeDx: true });
      if (kind === 'attendance') await printAttendance(c, { companion: rootEl.querySelector('[data-companion]')?.value.trim() || '' });
      if (kind === 'report') await printReport(c, p);
      if (kind === 'referral') await printReferral(c);
      if (kind === 'odontogram') await printOdontogram({ ...p, id: c.patientId, name: c.patientName, idDoc: c.patientIdDoc, birthDate: c.patientBirth }, c.odontogram, c);
      if (kind === 'consent') await printConsent(c, { kind: rootEl.querySelector('[data-consent]')?.value || 'general', teeth: rootEl.querySelector('[data-consent-teeth]')?.value || '' });
      if (current === 'docs') rerenderKeepScroll();
    } catch (ex) { toast(ex.message, 'warning'); }
    finally { if (btn && document.contains(btn)) setBusy(btn, false); }
  }

  async function finish(mode) {
    await flush();
    if (!c.reason && !c.diagnoses.length && !c.procedures.length) { toast('Indica el motivo de consulta, un diagnóstico o un tratamiento realizado antes de cerrar.', 'warning'); current = 'eval'; render(); return; }
    const conflicts = c.rx.map((r) => allergyConflict(r, c.allergies)).filter(Boolean);
    if (conflicts.length && !(await confirmDialog({ title: '⚠️ Récipe con posible alergia', message: `Hay medicamentos que chocan con las alergias del paciente (${esc([...new Set(conflicts)].join(', '))}). ¿Cerrar de todas formas?`, confirmText: 'Cerrar igual', danger: true }))) return;
    const nextAppt = c.nextVisit?.date && c.nextVisit?.time ? c.nextVisit : null;
    const total = itemsTotal(c.charges);
    const done = (out) => { dirty = false; clearInterval(timer); prevClose(); afterClose(out); };
    try {
      if (mode === 'pay') {
        await openPay({
          title: `Cobrar atención ${c.number}`, sub: esc(c.patientName), amount: total, baseTotal: total, discount: true, printLabel: 'Imprimir recibo',
          onConfirm: async (res) => {
            const out = await closeConsultation(c, { charge: { payments: res.payments, changeCurrency: res.changeCurrency, discount: res.discount }, nextAppt });
            if (res.print && out.sale) printReceipt(out.sale);
            done(out); return out;
          }
        });
      } else {
        if (mode === 'free' && total > 0 && !(await confirmDialog({ title: 'Cerrar sin cargo', message: `La atención se registrará como cortesía (sin cobro de ${usd(total)}).`, confirmText: 'Cerrar sin cargo' }))) return;
        const out = await closeConsultation(c, { nextAppt, waive: mode === 'free' });
        done(out);
      }
    } catch (ex) { toast(ex.message, 'danger', 5000); }
  }

  render();
  return m;
}

function addMonths(mm) { const d = new Date(); d.setMonth(d.getMonth() + mm); return d; }
function elapsed(iso) { const mm = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return mm < 60 ? `${mm} min` : `${Math.floor(mm / 60)} h ${mm % 60} min`; }

/** Pantalla tras cerrar: imprimir, enviar indicaciones, abonar al presupuesto y pasar al siguiente paciente */
function afterClose({ consultation: c, sale, low, control }) {
  notifyLowStock(low);
  const next = store.waiting.find((a) => a.patientId !== c.patientId);
  const plans = store.patientPlans(c.patientId).filter((p) => ['presentado', 'aprobado', 'en_curso'].includes(p.status) && planTotals(p).balance > 0.009);
  const m = openModal({
    size: 'md',
    body: `<div class="center stack" style="padding:14px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('checkCircle')}</div>
      <div><div class="muted small">Atención cerrada</div><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">${esc(c.number)} · ${esc(c.patientName)}</div></div>
      <div class="row row-wrap" style="justify-content:center;gap:6px">${sale ? `<span class="badge badge-success">Cobrada ${usd(sale.received ?? sale.total)} · ${esc(sale.number)}</span>` : c.billing === 'pendiente' ? `<span class="badge badge-warning">Por cobrar ${usd(c.total)}</span>` : '<span class="badge badge-neutral">Sin cargo</span>'}${control ? `<span class="badge badge-info">${icon('calendar')} Próxima cita ${fmtDate(control.date)} ${esc(control.time)}</span>` : ''}${c.procedures?.length ? `<span class="badge badge-violet">${icon('tooth')} ${c.procedures.length} tratamiento(s)</span>` : ''}</div>
      ${sale?.changeUSD > 0.009 ? `<div class="badge badge-warning" style="height:28px;font-size:13px">Vuelto: ${usd(sale.changeUSD)}</div>` : ''}
    </div>
    <div class="grid-2 mt">
      ${plans.map((p) => `<button class="btn btn-success" data-abono="${p.id}">${icon('dollar')} Abonar a ${esc(p.number)} (saldo ${usd(planTotals(p).balance)})</button>`).join('')}
      ${c.rx?.length ? `<button class="btn btn-secondary" data-rx>${icon('print')} Récipe e indicaciones</button>` : ''}
      ${c.rx?.length || c.indications || c.nextVisit ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Indicaciones por WhatsApp</button>` : ''}
      ${sale ? `<button class="btn btn-secondary" data-rc>${icon('print')} Recibo ${esc(sale.number)}</button>` : ''}
      ${control ? `<button class="btn btn-secondary" data-wc>${icon('calendar')} Avisar la próxima cita</button>` : ''}
    </div>`,
    footer: `${next ? `<button class="btn btn-primary" data-next>${icon('arrowRight')} Siguiente: ${esc(next.patientName.split(' ')[0])}</button>` : ''}<button class="btn ${next ? 'btn-secondary' : 'btn-primary'}" data-close>Listo</button>`
  });
  const q = (s) => m.el.querySelector(s);
  m.el.querySelectorAll('[data-abono]').forEach((b) => b.onclick = async () => { const { payPlanFlow } = await import('./plans.js'); payPlanFlow(store.plan(b.dataset.abono), () => b.remove()); });
  if (q('[data-rx]')) q('[data-rx]').onclick = () => printRecipe(c).catch((e) => toast(e.message, 'warning'));
  if (q('[data-wa]')) q('[data-wa]').onclick = () => waPatient('indicaciones', { consult: c, patient: store.patient(c.patientId) || {} });
  if (q('[data-rc]')) q('[data-rc]').onclick = () => printReceipt(sale);
  if (q('[data-wc]')) q('[data-wc]').onclick = () => waPatient('agendada', { appt: control, patient: store.patient(c.patientId) || {} });
  if (q('[data-next]')) q('[data-next]').onclick = async () => { m.close(); await callPatient(next); };
}

/** Pasa a atención al paciente de una cita (desde sala de espera o agenda) */
export async function callPatient(appt) {
  const { startConsultation } = await import('./ops.js');
  const p = store.patient(appt.patientId) || await store.getPatient(appt.patientId);
  if (!p) { toast('No se encontró el paciente de la cita.', 'danger'); return; }
  const c = await startConsultation({ patient: p, appointment: appt });
  return openConsultation(c);
}

/** Cobra una atención que quedó pendiente */
export async function chargePending(c) {
  if (!c) return null;
  const total = round2(itemsTotal(c.charges) - (c.discount || 0));
  return openPay({
    title: `Cobrar atención ${c.number}`, sub: esc(c.patientName), amount: total, baseTotal: total, discount: true, printLabel: 'Imprimir recibo',
    onConfirm: async (res) => {
      const out = await chargeConsultation(c, { payments: res.payments, changeCurrency: res.changeCurrency, discount: res.discount });
      if (res.print) printReceipt(out.sale);
      showPaid(out.sale, { title: 'Atención cobrada', onPrint: () => printReceipt(out.sale) });
      return out;
    }
  });
}

// ======================================================================
// ATENCIÓN CERRADA (solo lectura)
// ======================================================================
export function openConsultView(c) {
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('repair-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const sec = (t, v, ic = 'clipboard') => v ? `<div class="card"><div class="card-title">${icon(ic)} ${t}</div><p class="small" style="margin:8px 0 0;white-space:pre-wrap">${esc(v)}</p></div>` : '';
  function render() {
    const v = c.vitals || {}; const ta = taClass(v.ta);
    const vit = VITALS.filter(([k]) => String(v[k] || '').trim());
    const odo = c.odontogramAfter || c.odontogram;
    rootEl.innerHTML = `<div class="rp-head">
        <div class="rp-dev"><span class="rp-icon">${icon('tooth')}</span><div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(c.number)}</span>${c.status === 'anulada' ? '<span class="badge badge-danger">Anulada</span>' : '<span class="badge badge-success">Cerrada</span>'}${c.billing === 'pendiente' ? '<span class="badge badge-danger">Por cobrar</span>' : c.billing === 'pagada' ? `<span class="badge badge-success">Pagada ${esc(c.saleNumber || '')}</span>` : c.billing === 'sin_cargo' ? '<span class="badge badge-neutral">Sin cargo</span>' : ''}<span class="badge badge-neutral">${esc(APPT_TYPES[c.type]?.label || '')}</span></div>
          <div class="rp-title ellipsis click" data-pt>${esc(c.patientName)}</div>
          <div class="small muted">${fmtDateTime(c.startedAt)}${c.closedAt ? ' – ' + fmtTime(c.closedAt) : ''} · ${esc(c.doctor || '')} · ${esc([c.patientIdDoc, ageText(c.patientBirth)].filter(Boolean).join(' · '))}</div>
        </div><button class="x-btn" data-x>${icon('x')}</button></div>
        ${allergyStrip(c.allergies)}
      </div>
      <div class="rp-body"><div class="stack">
        ${odo && Object.keys(odo.teeth || {}).length ? `<div class="card"><div class="card-title">${icon('tooth')} Odontograma al cerrar la atención</div><div class="mt">${renderOdo(odo, { interactive: false })}</div>${odoStats(odo)}</div>` : ''}
        <div class="rp-grid">
        <div class="stack">
          ${sec('Motivo de consulta', c.reason)}${sec('Enfermedad actual', c.illness, 'history')}${sec('Examen extraoral', c.extraoral, 'user')}${sec('Examen intraoral', [c.intraoral, c.hygiene && 'Higiene oral: ' + c.hygiene, c.occlusion && 'Oclusión: ' + c.occlusion].filter(Boolean).join('\n'), 'smile')}
          ${c.diagnoses?.length ? `<div class="card"><div class="card-title">${icon('clipboard')} Diagnósticos</div><div class="stack-sm mt">${c.diagnoses.map((d, i) => `<div class="dx-item"><span class="dx-code">${esc(d.code || '—')}</span><div class="grow"><b>${esc(d.name)}</b>${d.tooth ? ` <span class="tooth-chip">${esc(d.tooth)}</span>` : ''}<div class="t-sub">${i === 0 ? 'Principal · ' : ''}${esc(d.type || '')}</div></div></div>`).join('')}</div></div>` : ''}
          ${c.procedures?.length ? `<div class="card"><div class="card-title">${icon('checkCircle')} Tratamientos realizados</div><div class="list mt">${c.procedures.map((x) => `<div class="list-item"><div class="grow">${itemLabel(x)}${x.note ? `<div class="t-sub">${esc(x.note)}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
          ${c.anesthesia?.length ? `<div class="card"><div class="card-title">${icon('needle')} Anestesia</div><div class="list mt">${c.anesthesia.map((a) => `<div class="list-item small">${esc(ANESTHETICS.find((x) => x.k === a.k)?.name || a.k)} · ${esc(a.technique || '')} · ${esc(a.cartridges || '')} cartucho(s)${a.zone ? ' · ' + esc(a.zone) : ''}</div>`).join('')}</div></div>` : ''}
          ${sec('Evolución y plan', c.plan, 'edit')}
        </div>
        <div class="stack">
          ${vit.length ? `<div class="card"><div class="card-title">${icon('pulse')} Signos vitales</div><div class="vgrid mt">${vit.map(([k, l, u]) => `<div class="vcell ${k === 'ta' && ta ? 'tone-' + ta.tone : ''}"><span>${l}</span><b>${esc(v[k])}</b><small>${u}</small></div>`).join('')}</div></div>` : ''}
          ${c.rx?.length ? `<div class="card"><div class="card-title">${icon('pill')} Récipe</div><div class="list mt">${c.rx.map((r, i) => `<div class="list-item"><span class="rx-n">${i + 1}</span><div class="grow"><b>${esc(r.name)}</b> <span class="muted small">${esc(r.presentation || '')}</span><div class="t-sub">${esc([r.dose, r.frequency, r.duration && 'por ' + r.duration].filter(Boolean).join(', '))}</div></div></div>`).join('')}</div>${c.indications ? `<p class="small" style="white-space:pre-wrap;margin:10px 0 0">${esc(c.indications)}</p>` : ''}</div>` : ''}
          ${c.labs?.length || c.imaging?.length ? `<div class="card"><div class="card-title">${icon('image')} Estudios solicitados</div><div class="tagrow mt">${[...(c.imaging || []), ...(c.labs || [])].map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>${c.labNote ? `<p class="small" style="margin:8px 0 0">${esc(c.labNote)}</p>` : ''}</div>` : ''}
          ${c.nextVisit?.date ? `<div class="card"><div class="card-title">${icon('calendar')} Próxima cita</div><p style="margin:8px 0 0"><b>${fmtDate(c.nextVisit.date)}</b> ${esc(c.nextVisit.time || '')}</p></div>` : ''}
          ${c.docs?.length ? `<div class="card"><div class="card-title">${icon('qr')} Documentos emitidos</div><div class="list mt">${c.docs.map((d) => `<div class="list-item"><div class="grow"><b>${esc(DOC_KINDS[d.kind] || d.kind)}</b>${d.revoked ? ' <span class="badge badge-danger">Anulado</span>' : ''}<div class="t-sub">${esc(d.summary || '')}</div></div><span class="mono small">${esc(d.code)}</span>${d.revoked ? '' : `<button class="btn btn-ghost btn-icon btn-sm" data-revoke="${d.code}" title="Anular documento">${icon('x')}</button>`}</div>`).join('')}</div></div>` : ''}
          <div class="card"><div class="card-title">${icon('edit')} Notas adicionales</div>
            ${(c.addenda || []).map((a) => `<div class="addendum"><div class="t-sub">${fmtDateTime(a.at)} · ${esc(a.by)}</div><div class="small" style="white-space:pre-wrap">${esc(a.text)}</div></div>`).join('') || '<p class="small muted" style="margin:8px 0">La nota clínica cerrada no se modifica. Agrega aquí la evolución, controles o correcciones.</p>'}
            ${c.status === 'cerrada' ? `<textarea class="textarea mt" data-add placeholder="Ej.: control a las 48 h: sin dolor, buena cicatrización…"></textarea><button class="btn btn-secondary btn-sm mt" data-add-btn>${icon('plus')} Agregar nota</button>` : ''}
          </div>
        </div>
      </div></div></div>
      <div class="rp-foot">
        <div class="row row-wrap">${c.rx?.length ? `<button class="btn btn-secondary" data-p="recipe">${icon('print')} Récipe</button>` : ''}<button class="btn btn-secondary" data-p="report">${icon('file')} Informe</button>${c.referral?.to ? `<button class="btn btn-secondary" data-p="referral">${icon('send')} Referencia</button>` : ''}</div>
        <div class="row row-wrap"><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Indicaciones</button>${c.billing === 'pendiente' ? `<button class="btn btn-ghost" data-waive>Exonerar</button><button class="btn btn-primary" data-charge>${icon('dollar')} Cobrar ${usd((c.total || 0) - (c.discount || 0))}</button>` : ''}</div>
      </div>`;
    const q = (s) => rootEl.querySelector(s);
    q('[data-x]').onclick = () => m.close();
    q('[data-pt]').onclick = async () => { const { openPatient } = await import('./patient.js'); openPatient(c.patientId); };
    rootEl.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => {
      try { const k = b.dataset.p; if (k === 'recipe') await printRecipe(c); if (k === 'report') await printReport(c); if (k === 'referral') await printReferral(c); render(); }
      catch (ex) { toast(ex.message, 'warning'); }
    });
    q('[data-wa]').onclick = () => waPatient('indicaciones', { consult: c, patient: store.patient(c.patientId) || {} });
    const ab = q('[data-add-btn]'); if (ab) ab.onclick = async () => { try { c = await addAddendum(c, q('[data-add]').value); toast('Nota agregada'); render(); } catch (ex) { toast(ex.message, 'warning'); } };
    const ch = q('[data-charge]'); if (ch) ch.onclick = async () => { const out = await chargePending(c); if (out) { c = { ...c, billing: 'pagada', saleNumber: out.sale.number }; render(); } };
    const wv = q('[data-waive]'); if (wv) wv.onclick = async () => { if (!(await requirePin('Exonerar el cobro de una atención'))) return; await waiveConsultation(c, 'Exonerada'); c = { ...c, billing: 'sin_cargo' }; toast('Atención exonerada'); render(); };
    rootEl.querySelectorAll('[data-revoke]').forEach((b) => b.onclick = async () => {
      if (!(await requirePin('Anular un documento emitido'))) return;
      if (!(await confirmDialog({ title: 'Anular documento', message: 'Al verificarlo aparecerá como ANULADO.', confirmText: 'Anular', danger: true }))) return;
      await revokeDocument(c, b.dataset.revoke); toast('Documento anulado', 'warning'); render();
    });
  }
  render();
  return m;
}

/** Atención sin cita: elige (o registra) al paciente y abre la atención de inmediato */
export async function startWalkIn(patient = null) {
  const { pickPatient } = await import('./patient.js');
  const p = patient || await pickPatient({ title: 'Atención sin cita · ¿a quién atiendes?' });
  if (!p) return null;
  const { startConsultation } = await import('./ops.js');
  const todays = store.todayAppts.find((a) => a.patientId === p.id && ['programada', 'confirmada', 'espera'].includes(a.status));
  const c = await startConsultation({ patient: p, appointment: todays || null });
  return openConsultation(c);
}
