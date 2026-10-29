// Sano Dental — Presupuestos: editor del plan de tratamiento (con sugerencias del odontograma), ficha, abonos y avance
import { store, PLAN_STATUS, planBadge } from './store.js';
import { savePlan, setPlanStatus, payPlan, planTotals, togglePlanItem } from './ops.js';
import { requirePin } from './auth.js';
import { openModal, esc, usd, bs, num, toast, fmtDate, fmtDateTime, setBusy, confirmDialog, emptyState, shortId, round2, parseNum, normalize, todayKey, dayKey, addDays, loc } from './utils.js';
import { icon } from './icons.js';
import { PROC_CATS, UNIT_LABEL } from './clinical.js';
import { suggestPlan, surfLetters, toothName, cloneOdo, SURFACES, surfaceName } from './odontogram.js';
import { mountOdoEditor } from './odoui.js';
import { openPay, showPaid } from './pay.js';
import { printReceipt, waPatient } from './shared.js';

export const PHASES = { 1: 'Fase 1 · Urgencia y control de la infección', 2: 'Fase 2 · Restauradora y periodontal', 3: 'Fase 3 · Rehabilitación', 4: 'Fase 4 · Mantenimiento' };
/** Fase sugerida según la categoría del procedimiento */
const phaseFor = (cat) => (['Cirugía', 'Endodoncia', 'Diagnóstico'].includes(cat) ? 1 : ['Operatoria', 'Periodoncia', 'Prevención', 'Odontopediatría'].includes(cat) ? 2 : ['Prótesis', 'Implantes', 'Estética', 'Ortodoncia'].includes(cat) ? 3 : 2);
export const itemLabel = (it) => `${it.tooth ? `<span class="tooth-chip">${it.tooth}${it.surfaces?.length ? ' ' + esc(surfLetters(it.tooth, it.surfaces)) : ''}</span> ` : ''}${esc(it.name)}`;

/** Busca en el arancel por nombre, código o categoría */
export function searchProcs(q, max = 14) {
  const t = normalize(q).trim();
  const list = store.settings.services;
  if (!t) return list.slice(0, max);
  const w = t.split(/\s+/);
  return list.filter((p) => { const h = normalize(`${p.code || ''} ${p.name} ${p.cat || ''}`); return w.every((x) => h.includes(x)); }).slice(0, max);
}

// ======================================================================
// EDITOR DEL PRESUPUESTO
// ======================================================================
/** Resuelve con el presupuesto guardado o null */
export function openPlanEditor({ plan = null, patient = null, items = null, odontogram = null, consultationId = null } = {}) {
  return new Promise((resolve) => {
    const pt = patient || store.patient(plan?.patientId) || { id: plan?.patientId, name: plan?.patientName, phone: plan?.patientPhone, idDoc: plan?.patientIdDoc, number: plan?.patientNumber };
    const odo = cloneOdo(odontogram || plan?.odontogram || pt.odontogram || { dentition: 'permanente', teeth: {} });
    const st = {
      title: plan?.title || 'Plan de tratamiento', doctorId: plan?.doctorId || store.mainDoctor?.id || null, validUntil: plan?.validUntil || dayKey(addDays(new Date(), Number(store.settings.planValidDays) || 30)),
      items: JSON.parse(JSON.stringify(plan?.items || items || [])), discount: plan?.discount || 0, notes: plan?.notes ?? (store.settings.planNote || ''),
      financing: plan?.financing || { initial: 0, installments: 0, every: 'mensual' }
    };
    let tooth = null; let surfs = new Set(); let phase = 0; let saved = null; let q = '';
    const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>', dismissible: false, onClose: () => resolve(saved) });
    m.el.querySelector('.modal').classList.add('repair-modal');
    const rootEl = m.el.querySelector('[data-root]');

    const totals = () => planTotals({ items: st.items, discount: st.discount, paid: plan?.paid || 0 });
    function itemsTable() {
      if (!st.items.length) return emptyState('clipboard', 'Presupuesto vacío', odontogram || Object.keys(odo.teeth).length ? 'Toca “Sugerir desde el odontograma” o busca un procedimiento.' : 'Busca un procedimiento del arancel y agrégalo.');
      const phases = [...new Set(st.items.map((i) => i.phase || 1))].sort();
      return phases.map((ph) => {
        const rows = st.items.map((it, i) => [it, i]).filter(([it]) => (it.phase || 1) === ph);
        const sub = rows.reduce((a, [it]) => a + it.price * it.qty, 0);
        return `<div class="plan-phase"><div class="between"><b class="small">${esc(PHASES[ph] || 'Fase ' + ph)}</b><span class="t-sub">${usd(sub)}</span></div>
          ${rows.map(([it, i]) => `<div class="plan-line ${it.status === 'realizado' ? 'done' : ''}">
            <div class="grow" style="min-width:0">${itemLabel(it)}${it.status === 'realizado' ? ' <span class="badge badge-success">Realizado</span>' : ''}${it.reason ? `<div class="t-sub">${esc(it.reason)}</div>` : ''}</div>
            <select class="select select-xs" data-ph="${i}" title="Fase">${[1, 2, 3, 4].map((p) => `<option value="${p}" ${p === (it.phase || 1) ? 'selected' : ''}>F${p}</option>`).join('')}</select>
            <div class="stepper sm"><button data-qt="${i}" data-d="-1">${icon('minus')}</button><span>${it.qty}</span><button data-qt="${i}" data-d="1">${icon('plus')}</button></div>
            <div class="input-group" style="width:104px;flex:none"><span class="prefix">${esc(loc().sym)}</span><input class="input input-sm" data-pr="${i}" inputmode="decimal" value="${num(it.price)}"></div>
            <button class="btn btn-ghost btn-icon btn-sm" data-rm="${i}" ${it.status === 'realizado' ? 'disabled title="Ya realizado"' : ''}>${icon('x')}</button>
          </div>`).join('')}</div>`;
      }).join('');
    }
    function totalsBox() {
      const t = totals(); const f = st.financing || {};
      const initial = round2(t.total * (Number(f.initial) || 0) / 100);
      const n = Number(f.installments) || 0;
      const cuota = n ? round2((t.total - initial) / n) : 0;
      return `<div class="summary-box">
        <div class="summary-row"><span>Subtotal (${st.items.length} tratamiento(s))</span><b>${usd(t.subtotal)}</b></div>
        <div class="summary-row"><span>Descuento</span><span class="row" style="gap:6px"><div class="input-group" style="width:110px"><span class="prefix">${esc(loc().sym)}</span><input class="input input-sm" data-disc inputmode="decimal" value="${st.discount ? num(st.discount) : ''}" placeholder="0,00"></div><button class="btn btn-ghost btn-sm" data-dp="5">5%</button><button class="btn btn-ghost btn-sm" data-dp="10">10%</button></span></div>
        <div class="summary-row big"><span>Total</span><b>${usd(t.total)}</b></div>
        <div class="summary-row"><span></span></div>
      </div>
      <div class="section-title mt">Forma de pago</div>
      <div class="form-grid form-grid-3">
        <div class="field"><label>Inicial</label><select class="select select-sm" data-fi>${[0, 20, 30, 40, 50, 100].map((p) => `<option value="${p}" ${Number(f.initial) === p ? 'selected' : ''}>${p ? p + ' %' : 'Sin inicial'}</option>`).join('')}</select></div>
        <div class="field"><label>Cuotas</label><select class="select select-sm" data-fn>${[0, 2, 3, 4, 6, 8, 10, 12, 18, 24].map((p) => `<option value="${p}" ${n === p ? 'selected' : ''}>${p ? p + ' cuotas' : 'Contado / por sesión'}</option>`).join('')}</select></div>
        <div class="field"><label>Frecuencia</label><select class="select select-sm" data-fe>${['mensual', 'quincenal', 'semanal', 'por sesión'].map((x) => `<option ${f.every === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      </div>
      ${n || initial ? `<div class="vital-alert info">${icon('wallet')} ${initial ? `Inicial <b>${usd(initial)}</b>` : ''}${initial && n ? ' + ' : ''}${n ? `<b>${n}</b> cuota(s) ${esc(f.every || 'mensual')}(es) de <b>${usd(cuota)}</b>` : ''}</div>` : ''}`;
    }
    function render() {
      const res = searchProcs(q);
      rootEl.innerHTML = `<div class="rp-head"><div class="rp-dev"><span class="rp-icon">${icon('clipboard')}</span>
          <div class="grow" style="min-width:0"><div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(plan?.number || 'Nuevo presupuesto')}</span>${plan ? planBadge(plan.status) : ''}</div>
            <div class="rp-title ellipsis">${esc(pt.name || '')}</div><div class="small muted">${esc([pt.number, pt.idDoc && loc().id + ' ' + pt.idDoc].filter(Boolean).join(' · '))}</div></div>
          <button class="x-btn" data-x>${icon('x')}</button></div></div>
        <div class="rp-body"><div class="rp-grid plan-grid">
          <div class="stack">
            <div class="card stack">
              <div class="form-grid">
                <div class="field full"><label>Título</label><input class="input" data-title value="${esc(st.title)}" placeholder="Ej.: Rehabilitación integral, Ortodoncia, Urgencia…"></div>
                ${store.activeDoctors.length ? `<div class="field"><label>Odontólogo</label><select class="select" data-doc>${store.activeDoctors.map((d) => `<option value="${d.id}" ${d.id === st.doctorId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>` : ''}
                <div class="field"><label>Válido hasta</label><input class="input" type="date" data-valid value="${esc(st.validUntil)}"></div>
              </div>
            </div>
            <div class="card stack" data-tour="plan-odo"><div class="between row-wrap"><div class="card-title">${icon('tooth')} Diente: ${tooth ? `<b class="text-brand">${tooth}</b> <span class="t-sub">${esc(toothName(tooth))}</span>` : '<span class="t-sub">toca un diente (opcional)</span>'}</div>
                ${Object.keys(odo.teeth || {}).length ? `<button class="btn btn-secondary btn-sm" data-suggest>${icon('sparkle')} Sugerir desde el odontograma</button>` : ''}</div>
              <div data-odo-sel></div>
              ${tooth ? `<div class="row row-wrap" style="gap:6px"><span class="small muted">Superficies:</span>${Object.keys(SURFACES).map((s) => `<button type="button" class="chip chip-xs ${surfs.has(s) ? 'on' : ''}" data-sf="${s}">${esc(surfaceName(tooth, s))}</button>`).join('')}<button type="button" class="chip chip-xs" data-tclear>${icon('x')} Sin diente</button></div>` : ''}
            </div>
            <div class="card stack"><div class="card-title">${icon('search')} Agregar del arancel</div>
              <div class="row row-wrap" style="gap:6px"><label class="search grow">${icon('search')}<input data-q value="${esc(q)}" placeholder="Resina, endodoncia, corona, limpieza, E03…" autocomplete="off"></label>
                <select class="select select-sm" data-phase style="width:auto"><option value="0">Fase automática</option>${[1, 2, 3, 4].map((p) => `<option value="${p}" ${phase === p ? 'selected' : ''}>Fase ${p}</option>`).join('')}</select></div>
              <div class="list proc-results">${res.map((p, i) => `<button type="button" class="list-item click" data-add="${i}"><span class="dx-code">${esc(p.code || '—')}</span><span class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><span class="t-sub">${esc(p.cat || '')} · ${esc(UNIT_LABEL[p.unit] || '')}</span></span><b>${usd(p.price)}</b>${icon('plus')}</button>`).join('') || '<p class="small muted">Sin resultados. Agrega el procedimiento en Configuración › Aranceles.</p>'}</div>
            </div>
          </div>
          <div class="stack">
            <div class="card stack"><div class="card-title">${icon('list')} Tratamientos del presupuesto</div>${itemsTable()}</div>
            <div class="card stack">${totalsBox()}</div>
            <div class="card stack"><div class="card-title">${icon('edit')} Notas y condiciones</div><textarea class="textarea" data-notes placeholder="Condiciones, garantía, observaciones…">${esc(st.notes)}</textarea></div>
          </div>
        </div></div>
        <div class="rp-foot"><div class="row row-wrap"><span class="small muted">${plan ? 'Los tratamientos ya realizados no se pueden quitar.' : 'Puedes guardarlo como borrador o presentarlo al paciente.'}</span></div>
          <div class="row row-wrap">${!plan ? `<button class="btn btn-secondary" data-save="borrador">${icon('file')} Guardar borrador</button>` : ''}<button class="btn btn-primary" data-save="presentado">${icon('check')} ${plan ? 'Guardar cambios' : 'Guardar y presentar'}</button></div></div>`;
      bind();
    }
    const keepScroll = (fn) => { const md = m.el.querySelector('.modal'); const y = md.scrollTop; fn(); md.scrollTop = y; };
    function bind() {
      const qs = (s) => rootEl.querySelector(s);
      const all = (s, fn) => rootEl.querySelectorAll(s).forEach(fn);
      qs('[data-x]').onclick = async () => { if (st.items.length && !saved && !(await confirmDialog({ title: 'Salir sin guardar', message: 'Se perderán los cambios del presupuesto.', confirmText: 'Salir', danger: true }))) return; m.close(); };
      mountOdoEditor(qs('[data-odo-sel]'), odo, { selectMode: { selected: new Set(tooth ? [tooth] : []), onTooth: (n) => { tooth = tooth === n ? null : n; surfs = new Set(Object.entries(odo.teeth[n]?.s || {}).filter(([, c]) => ['caries', 'defectuosa'].includes(c)).map(([s]) => s)); keepScroll(render); } } });
      qs('[data-title]').oninput = (e) => { st.title = e.target.value; };
      const dc = qs('[data-doc]'); if (dc) dc.onchange = () => { st.doctorId = dc.value; };
      qs('[data-valid]').onchange = (e) => { st.validUntil = e.target.value; };
      qs('[data-notes]').oninput = (e) => { st.notes = e.target.value; };
      const sg = qs('[data-suggest]'); if (sg) sg.onclick = () => {
        const sug = suggestPlan(odo, (code) => !!store.proc(code));
        let added = 0;
        for (const s of sug) {
          const p = store.proc(s.code); if (!p) continue;
          if (st.items.some((it) => it.code === p.code && Number(it.tooth) === s.tooth)) continue;
          st.items.push({ id: shortId(6), code: p.code, name: p.name, cat: p.cat, tooth: s.tooth, surfaces: s.surfaces, qty: 1, price: Number(p.price) || 0, phase: phaseFor(p.cat), status: 'pendiente', reason: s.reason });
          added++;
        }
        toast(added ? `${added} tratamiento(s) sugerido(s) agregados` : 'No hay hallazgos nuevos en rojo para presupuestar', added ? 'success' : 'info');
        keepScroll(render);
      };
      all('[data-sf]', (b) => b.onclick = () => { const s = b.dataset.sf; surfs.has(s) ? surfs.delete(s) : surfs.add(s); b.classList.toggle('on', surfs.has(s)); });
      const tc = qs('[data-tclear]'); if (tc) tc.onclick = () => { tooth = null; surfs = new Set(); keepScroll(render); };
      const qi = qs('[data-q]');
      qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; keepScroll(render); const n = rootEl.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
      qs('[data-phase]').onchange = (e) => { phase = Number(e.target.value); };
      const res = searchProcs(q);
      all('[data-add]', (b) => b.onclick = () => {
        const p = res[+b.dataset.add];
        if (['diente', 'superficie'].includes(p.unit) && !tooth && !confirmTooth()) return;
        const sf = p.unit === 'superficie' ? [...surfs] : [];
        // La resina se ajusta al número de superficies elegidas
        let pp = p;
        if (p.unit === 'superficie' && /^O0[123]$/.test(p.code || '') && sf.length) pp = store.proc(sf.length >= 3 ? 'O03' : sf.length === 2 ? 'O02' : 'O01') || p;
        st.items.push({ id: shortId(6), code: pp.code || '', name: pp.name, cat: pp.cat || '', tooth: ['diente', 'superficie'].includes(p.unit) ? tooth : null, surfaces: sf, qty: 1, price: Number(pp.price) || 0, phase: phase || phaseFor(pp.cat), status: 'pendiente' });
        keepScroll(render);
      });
      all('[data-ph]', (el) => el.onchange = () => { st.items[+el.dataset.ph].phase = Number(el.value); keepScroll(render); });
      all('[data-qt]', (b) => b.onclick = () => { const it = st.items[+b.dataset.qt]; it.qty = Math.max(1, it.qty + Number(b.dataset.d)); keepScroll(render); });
      all('[data-pr]', (el) => el.onchange = () => { st.items[+el.dataset.pr].price = round2(parseNum(el.value)); keepScroll(render); });
      all('[data-rm]', (b) => b.onclick = () => { st.items.splice(+b.dataset.rm, 1); keepScroll(render); });
      qs('[data-disc]').onchange = (e) => { st.discount = round2(parseNum(e.target.value)); keepScroll(render); };
      all('[data-dp]', (b) => b.onclick = () => { st.discount = round2(totals().subtotal * Number(b.dataset.dp) / 100); keepScroll(render); });
      qs('[data-fi]').onchange = (e) => { st.financing = { ...st.financing, initial: Number(e.target.value) }; keepScroll(render); };
      qs('[data-fn]').onchange = (e) => { st.financing = { ...st.financing, installments: Number(e.target.value) }; keepScroll(render); };
      qs('[data-fe]').onchange = (e) => { st.financing = { ...st.financing, every: e.target.value }; keepScroll(render); };
      all('[data-save]', (b) => b.onclick = async () => {
        setBusy(b, true, 'Guardando…');
        try {
          saved = await savePlan({ ...st, patient: pt, odontogram: odo, consultationId: plan?.consultationId || consultationId, status: b.dataset.save, paid: plan?.paid || 0 }, plan?.id || null);
          toast(plan ? 'Presupuesto actualizado' : `Presupuesto ${saved.number} creado`);
          m.close();
        } catch (ex) { toast(ex.message, 'warning'); setBusy(b, false); }
      });
    }
    const confirmTooth = () => { toast('Primero toca en el odontograma el diente al que corresponde.', 'info', 3000); return false; };
    render();
  });
}

// ======================================================================
// FICHA DEL PRESUPUESTO
// ======================================================================
export async function openPlan(idOrPlan) {
  let plan = typeof idOrPlan === 'string' ? await store.getPlan(idOrPlan) : idOrPlan;
  if (!plan) { toast('No se encontró el presupuesto.', 'warning'); return; }
  let payments = null;
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('repair-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const off = store.on('plans', () => { const f = store.plan(plan.id); if (f && f.updatedAt !== plan.updatedAt) { plan = f; render(); } });
  const prev = m.close; m.close = () => { off(); prev(); };
  const loadPays = async () => { payments = (await store.listEq('sales', 'planId', plan.id).catch(() => [])).sort((a, b) => (b.date || '').localeCompare(a.date || '')); render(); };

  function render() {
    const t = planTotals(plan);
    const open = ['presentado', 'aprobado', 'en_curso', 'borrador'].includes(plan.status);
    const phases = [...new Set((plan.items || []).map((i) => i.phase || 1))].sort();
    rootEl.innerHTML = `<div class="rp-head"><div class="rp-dev"><span class="rp-icon">${icon('clipboard')}</span>
        <div class="grow" style="min-width:0"><div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(plan.number)}</span>${planBadge(plan.status)}${plan.validUntil && plan.validUntil < todayKey() && ['presentado', 'borrador'].includes(plan.status) ? '<span class="badge badge-warning">Vencido</span>' : ''}</div>
          <div class="rp-title ellipsis click" data-pt>${esc(plan.patientName)}</div>
          <div class="small muted">${esc(plan.title || '')} · ${fmtDate(plan.createdAt)}${plan.doctor ? ' · ' + esc(plan.doctor) : ''}</div></div>
        <button class="x-btn" data-x>${icon('x')}</button></div>
        <div class="rp-money">
          <div><span>Total</span><b>${usd(t.total)}</b></div>
          <div><span>Realizado</span><b>${usd(t.executed)}</b></div>
          <div><span>Abonado</span><b class="text-success">${usd(t.paid)}</b></div>
          <div><span>Saldo</span><b class="${t.balance > 0.009 ? 'text-danger' : ''}">${usd(t.balance)}</b></div>
          <div><span>${t.owed > 0 ? 'Debe de lo realizado' : 'A favor'}</span><b class="${t.owed > 0 ? 'text-danger' : 'text-brand'}">${usd(t.owed > 0 ? t.owed : t.credit)}</b></div>
        </div>
        <div class="progress mt"><i style="width:${t.progress}%"></i></div><div class="t-sub mt-xs">${t.done} de ${t.count} tratamiento(s) realizados · ${t.progress} %</div>
      </div>
      <div class="rp-body"><div class="rp-grid">
        <div class="stack">
          ${phases.map((ph) => `<div class="card"><div class="card-title">${esc(PHASES[ph] || 'Fase ' + ph)}</div><div class="list mt">${(plan.items || []).filter((i) => (i.phase || 1) === ph).map((it) => `<div class="list-item">
            <label class="check"><input type="checkbox" data-done="${it.id}" ${it.status === 'realizado' ? 'checked' : ''} ${open ? '' : 'disabled'}><span></span></label>
            <div class="grow" style="min-width:0;${it.status === 'realizado' ? 'opacity:.7' : ''}"><div>${itemLabel(it)}</div><div class="t-sub">${it.status === 'realizado' ? `Realizado ${fmtDate(it.doneAt)}${it.consultNumber ? ' · ' + esc(it.consultNumber) : ''}${it.doneBy ? ' · ' + esc(it.doneBy) : ''}` : 'Pendiente'}</div></div>
            <b>${usd(it.price * (it.qty || 1))}</b></div>`).join('')}</div></div>`).join('')}
          ${plan.notes ? `<div class="card"><div class="card-title">${icon('edit')} Notas</div><p class="small" style="white-space:pre-wrap;margin:8px 0 0">${esc(plan.notes)}</p></div>` : ''}
        </div>
        <div class="stack">
          <div class="card"><div class="card-title">${icon('wallet')} Totales y forma de pago</div>
            <div class="summary-box mt"><div class="summary-row"><span>Subtotal</span><b>${usd(t.subtotal)}</b></div>${t.discount ? `<div class="summary-row"><span>Descuento</span><b>-${usd(t.discount)}</b></div>` : ''}<div class="summary-row big"><span>Total</span><b>${usd(t.total)}</b></div></div>
            ${plan.financing?.installments || plan.financing?.initial ? `<p class="small mt">${planFinancingText(plan)}</p>` : ''}
            ${open && t.balance > 0.009 ? `<button class="btn btn-success btn-lg btn-block mt" data-pay>${icon('dollar')} Registrar abono</button>` : ''}
          </div>
          <div class="card"><div class="card-title">${icon('receipt')} Abonos</div>
            ${!payments ? '<div class="spinner" style="margin:12px auto"></div>' : payments.length ? `<div class="list mt">${payments.map((s) => `<div class="list-item" style="${s.status === 'voided' ? 'opacity:.5' : ''}"><div class="grow"><b>${esc(s.number)}</b>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}<div class="t-sub">${fmtDateTime(s.date)}</div></div><b>${usd(s.total)}</b><button class="btn btn-ghost btn-icon btn-sm" data-rc="${s.id}" title="Imprimir recibo">${icon('print')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">Sin abonos todavía.</p>'}
          </div>
          <div class="card"><div class="card-title">${icon('history')} Historial</div><div class="list mt">${(plan.history || []).slice().reverse().slice(0, 12).map((h) => `<div class="list-item"><div class="grow small">${esc(h.note)}<div class="t-sub">${fmtDateTime(h.at)} · ${esc(h.by || '')}</div></div></div>`).join('')}</div></div>
        </div>
      </div></div>
      <div class="rp-foot">
        <div class="row row-wrap"><button class="btn btn-secondary" data-print>${icon('print')} Imprimir</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>${open ? `<button class="btn btn-secondary" data-edit>${icon('edit')} Editar</button><button class="btn btn-ghost" data-lab>${icon('flask')} Laboratorio</button>` : ''}</div>
        <div class="row row-wrap">${open ? `<button class="btn btn-ghost" data-void>${icon('trash')} Anular</button>` : ''}${['presentado', 'borrador'].includes(plan.status) ? `<button class="btn btn-ghost" data-reject>No aceptado</button><button class="btn btn-primary" data-approve>${icon('check')} Aprobar</button>` : ''}${plan.status === 'rechazado' ? `<button class="btn btn-secondary" data-reopen>Reabrir</button>` : ''}</div>
      </div>`;
    const qs = (s) => rootEl.querySelector(s);
    qs('[data-x]').onclick = () => m.close();
    qs('[data-pt]').onclick = async () => { const { openPatient } = await import('./patient.js'); openPatient(plan.patientId, { tab: 'presupuestos' }); };
    qs('[data-print]').onclick = async () => { try { const { printBudget } = await import('./docs.js'); await printBudget(plan); } catch (e) { toast(e.message, 'warning'); } };
    qs('[data-wa]').onclick = () => waPatient('presupuesto', { patient: store.patient(plan.patientId) || { name: plan.patientName, phone: plan.patientPhone }, plan });
    const ed = qs('[data-edit]'); if (ed) ed.onclick = async () => { const s = await openPlanEditor({ plan }); if (s) { plan = { ...plan, ...s }; render(); } };
    const lb = qs('[data-lab]'); if (lb) lb.onclick = async () => { const { openLabForm } = await import('./views/lab.js'); openLabForm({ patient: store.patient(plan.patientId), plan }); };
    const ap = qs('[data-approve]'); if (ap) ap.onclick = async () => { plan = await setPlanStatus(plan, 'aprobado', 'Aprobado por el paciente'); toast('Presupuesto aprobado'); render(); };
    const rj = qs('[data-reject]'); if (rj) rj.onclick = async () => { if (!(await confirmDialog({ title: 'Presupuesto no aceptado', message: 'Quedará registrado como no aceptado (puedes reabrirlo después).', confirmText: 'Marcar' }))) return; plan = await setPlanStatus(plan, 'rechazado', 'No aceptado por el paciente'); render(); };
    const ro = qs('[data-reopen]'); if (ro) ro.onclick = async () => { plan = await setPlanStatus(plan, 'presentado', 'Reabierto'); render(); };
    const vd = qs('[data-void]'); if (vd) vd.onclick = async () => {
      if (!(await requirePin('Anular un presupuesto'))) return;
      if (!(await confirmDialog({ title: 'Anular presupuesto', message: `${esc(plan.number)} quedará anulado.${t.paid > 0 ? ` Tiene abonos por ${usd(t.paid)}: anúlalos en Facturación si corresponde devolverlos.` : ''}`, confirmText: 'Anular', danger: true }))) return;
      plan = await setPlanStatus(plan, 'anulado', 'Anulado'); render();
    };
    rootEl.querySelectorAll('[data-done]').forEach((cb) => cb.onchange = async () => { try { plan = await togglePlanItem(plan, cb.dataset.done, cb.checked); render(); } catch (e) { toast(e.message, 'danger'); } });
    const py = qs('[data-pay]'); if (py) py.onclick = () => payPlanFlow(plan, (p) => { plan = p; loadPays(); });
    rootEl.querySelectorAll('[data-rc]').forEach((b) => b.onclick = () => printReceipt(payments.find((s) => s.id === b.dataset.rc)));
  }
  render();
  loadPays();
  return m;
}

export function planFinancingText(plan) {
  const t = planTotals(plan); const f = plan.financing || {};
  const initial = round2(t.total * (Number(f.initial) || 0) / 100);
  const n = Number(f.installments) || 0;
  const cuota = n ? round2((t.total - initial) / n) : 0;
  return [initial ? `Inicial de ${usd(initial)} (${f.initial} %)` : '', n ? `${n} cuota(s) ${f.every || 'mensual'}(es) de ${usd(cuota)}` : ''].filter(Boolean).join(' y ') + '.';
}

/** Cobro de un abono al presupuesto */
export function payPlanFlow(plan, after = null) {
  const t = planTotals(plan); const f = plan.financing || {};
  const n = Number(f.installments) || 0;
  const initial = round2(t.total * (Number(f.initial) || 0) / 100);
  const sug = !t.paid && initial ? initial : n ? Math.min(t.balance, round2((t.total - initial) / n)) : t.owed > 0 ? t.owed : t.balance;
  return openPay({
    title: `Abono al presupuesto ${plan.number}`, sub: esc(plan.patientName), amount: round2(sug), editable: true, max: t.balance, printLabel: 'Imprimir recibo',
    onConfirm: async (res) => {
      const out = await payPlan(plan, { amount: res.amount, payments: res.payments, changeCurrency: res.changeCurrency });
      if (res.print) printReceipt(out.sale);
      showPaid(out.sale, { title: 'Abono registrado', onPrint: () => printReceipt(out.sale) });
      const fresh = { ...plan, paid: round2((plan.paid || 0) + res.amount), status: ['borrador', 'presentado'].includes(plan.status) ? 'aprobado' : plan.status };
      after?.(fresh);
      return out;
    }
  });
}

/** Presupuesto en una línea para listas */
export function planRow(p) {
  const t = planTotals(p);
  return `<div class="list-item click" data-plan="${p.id}"><span class="kpi-icon tone-${PLAN_STATUS[p.status]?.tone === 'success' ? 'success' : 'brand'}">${icon('clipboard')}</span>
    <div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(p.number)} · ${esc(p.title || 'Plan de tratamiento')}</div><div class="t-sub ellipsis">${esc(p.patientName)} · ${t.done}/${t.count} realizados</div><div class="progress sm mt-xs"><i style="width:${t.progress}%"></i></div></div>
    <div class="r"><b>${usd(t.total)}</b><div class="t-sub ${t.balance > 0.009 ? 'text-danger' : ''}">Saldo ${usd(t.balance)}</div></div>${planBadge(p.status)}</div>`;
}
