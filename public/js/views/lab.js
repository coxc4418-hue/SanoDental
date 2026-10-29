// Sano Dental — Laboratorio dental: órdenes de trabajo (coronas, prótesis, férulas…), fechas de prueba y entrega, pago al laboratorio
import { store, LAB_STATUS, OPEN_LAB, LAB_WORKS, VITA_SHADES } from '../store.js';
import { saveLabOrder, setLabStatus, payLab } from '../ops.js';
import { requirePin } from '../auth.js';
import { esc, usd, num, toast, openModal, emptyState, fmtDate, fmtDateTime, setBusy, todayKey, dayKey, addDays, parseNum, normalize, confirmDialog, loc } from '../utils.js';
import { icon } from '../icons.js';
import { waPatient, printDoc } from '../shared.js';

const labBadge = (s) => `<span class="badge badge-${LAB_STATUS[s]?.tone || 'neutral'}"><i class="dotc"></i>${esc(LAB_STATUS[s]?.label || s)}</span>`;
const NEXT = { por_enviar: ['enviado', 'Enviar al laboratorio', 'send'], enviado: ['prueba', 'Llegó para prueba', 'checkCircle'], prueba: ['enviado', 'Devolver al laboratorio', 'send'], recibido: ['instalado', 'Marcar instalado', 'checkCircle'], repeticion: ['enviado', 'Reenviar', 'send'] };
const overdue = (o) => o.dueDate && o.dueDate < todayKey() && ['por_enviar', 'enviado', 'prueba', 'repeticion'].includes(o.status);

/** Formulario de orden de laboratorio. Resuelve con la orden guardada o null. */
export function openLabForm({ patient = null, plan = null, order = null } = {}) {
  return new Promise((resolve) => {
    const o = order || {};
    let p = patient || (o.patientId ? store.patient(o.patientId) : null);
    let saved = null;
    const labs = [...new Set(store.labOrders.map((x) => x.lab).filter(Boolean).concat(store.settings.labs || []))];
    const teethFromPlan = plan ? [...new Set((plan.items || []).filter((i) => /corona|puente|incrust|carilla|perno|prótesis|protesis|placa/i.test(i.name) && i.tooth).map((i) => i.tooth))] : [];
    const m = openModal({
      title: order ? `Orden ${esc(o.number)}` : 'Nueva orden de laboratorio', sub: p ? esc(p.name) : 'Trabajo protésico para el laboratorio dental', size: 'lg',
      body: `<form class="stack" data-f autocomplete="off">
        ${p ? '' : `<button type="button" class="btn btn-secondary" data-pick>${icon('user')} Elegir paciente</button>`}
        <div class="form-grid">
          <div class="field full"><label>Trabajo *</label><input class="input" name="work" list="dl-works" value="${esc(o.work || '')}" placeholder="Ej.: Corona de zirconio"></div>
          <div class="field"><label>Dientes</label><input class="input" name="teeth" value="${esc((o.teeth || teethFromPlan).join(', '))}" placeholder="Ej.: 16, 26"></div>
          <div class="field"><label>Color (guía VITA)</label><select class="select" name="shade"><option value="">—</option>${VITA_SHADES.map((x) => `<option ${o.shade === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label>Laboratorio</label><input class="input" name="lab" list="dl-labs" value="${esc(o.lab || '')}" placeholder="Nombre del laboratorio"></div>
          <div class="field"><label>Teléfono del laboratorio</label><input class="input" name="labPhone" inputmode="tel" value="${esc(o.labPhone || '')}"></div>
          <div class="field"><label>Material / especificaciones</label><input class="input" name="material" value="${esc(o.material || '')}" placeholder="Ej.: monolítico, hombro 360°"></div>
          <div class="field"><label>Costo del laboratorio (${esc(loc().sym)})</label><input class="input" name="cost" inputmode="decimal" value="${o.cost ? num(o.cost, loc().dec) : ''}" placeholder="0"></div>
          <div class="field"><label>Fecha de envío</label><input class="input" type="date" name="sentDate" value="${esc(o.sentDate || todayKey())}"></div>
          <div class="field"><label>Fecha de prueba</label><input class="input" type="date" name="tryDate" value="${esc(o.tryDate || '')}"></div>
          <div class="field"><label>Fecha de entrega</label><input class="input" type="date" name="dueDate" value="${esc(o.dueDate || dayKey(addDays(new Date(), 7)))}"></div>
          <div class="field full"><label>Indicaciones</label><textarea class="textarea" name="notes" placeholder="Forma, textura, caracterizaciones, antagonista, registro de mordida…">${esc(o.notes || '')}</textarea></div>
        </div>
        <datalist id="dl-works">${LAB_WORKS.map((x) => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="dl-labs">${labs.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${order ? 'Guardar' : 'Crear orden'}</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    const pk = m.el.querySelector('[data-pick]');
    if (pk) pk.onclick = async () => { const { pickPatient } = await import('../patient.js'); const x = await pickPatient({ title: 'Paciente de la orden' }); if (x) { p = x; pk.innerHTML = `${icon('user')} ${esc(x.name)}`; } };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      if (!p) { err.textContent = 'Elige el paciente.'; return; }
      setBusy(e.currentTarget, true, 'Guardando…');
      try {
        saved = await saveLabOrder({ patient: p, planId: plan?.id || o.planId || null, work: F.work.value, teeth: F.teeth.value.split(/[^0-9]+/).filter(Boolean), shade: F.shade.value, lab: F.lab.value, labPhone: F.labPhone.value, material: F.material.value, cost: parseNum(F.cost.value), sentDate: F.sentDate.value, tryDate: F.tryDate.value, dueDate: F.dueDate.value, notes: F.notes.value }, order?.id || null);
        toast(order ? 'Orden actualizada' : `Orden ${saved.number} creada`);
        m.close();
      } catch (ex) { err.textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}

/** Ficha de la orden: estados, pago y aviso al paciente */
export function openLabOrder(o, after = null) {
  if (!o) return;
  const m = openModal({ title: `Orden ${esc(o.number)}`, sub: esc(o.patientName), size: 'md', body: '<div data-b></div>', footer: '<div data-f class="row row-wrap" style="width:100%;justify-content:flex-end;gap:8px"></div>' });
  const render = () => {
    const nx = NEXT[o.status];
    m.el.querySelector('[data-b]').innerHTML = `<div class="stack">
      <div class="row row-wrap" style="gap:6px">${labBadge(o.status)}${overdue(o) ? '<span class="badge badge-danger">Atrasada</span>' : ''}${o.paid ? '<span class="badge badge-success">Pagada al laboratorio</span>' : o.cost ? '<span class="badge badge-warning">Pago pendiente al laboratorio</span>' : ''}</div>
      <div class="summary-box">
        <div class="summary-row"><span>Trabajo</span><b>${esc(o.work)}</b></div>
        ${o.teeth?.length ? `<div class="summary-row"><span>Dientes</span><b>${esc(o.teeth.join(', '))}</b></div>` : ''}
        ${o.shade ? `<div class="summary-row"><span>Color</span><b>${esc(o.shade)}</b></div>` : ''}
        ${o.material ? `<div class="summary-row"><span>Material</span><b>${esc(o.material)}</b></div>` : ''}
        <div class="summary-row"><span>Laboratorio</span><b>${esc(o.lab || '—')}${o.labPhone ? ' · ' + esc(o.labPhone) : ''}</b></div>
        <div class="summary-row"><span>Envío · prueba · entrega</span><b>${fmtDate(o.sentDate)} · ${fmtDate(o.tryDate)} · ${fmtDate(o.dueDate)}</b></div>
        ${o.cost ? `<div class="summary-row"><span>Costo</span><b>${usd(o.cost)}</b></div>` : ''}
      </div>
      ${o.notes ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(o.notes)}</p>` : ''}
      <div class="section-title">Cambiar estado</div>
      <div class="chips chips-wrap">${Object.entries(LAB_STATUS).map(([k, s]) => `<button type="button" class="chip chip-xs ${o.status === k ? 'on' : ''}" data-st="${k}">${esc(s.label)}</button>`).join('')}</div>
      ${(o.history || []).length ? `<details><summary class="small bold click">Historial</summary><div class="list mt-xs">${o.history.slice().reverse().map((h) => `<div class="list-item small"><span class="grow">${esc(LAB_STATUS[h.note]?.label || h.note)}</span><span class="t-sub">${fmtDateTime(h.at)} · ${esc(h.by || '')}</span></div>`).join('')}</div></details>` : ''}
    </div>`;
    m.el.querySelector('[data-f]').innerHTML = `<button class="btn btn-ghost" data-edit style="margin-right:auto">${icon('edit')} Editar</button>
      ${o.labPhone ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://wa.me/${esc(String(o.labPhone).replace(/\D/g, ''))}?text=${encodeURIComponent(`Hola, consulto por la orden ${o.number} (${o.work}${o.teeth?.length ? ', dientes ' + o.teeth.join(', ') : ''}) del paciente ${o.patientName}. Entrega: ${fmtDate(o.dueDate)}.`)}">${icon('whatsapp')} Laboratorio</a>` : ''}
      ${['recibido', 'prueba'].includes(o.status) ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Avisar al paciente</button>` : ''}
      ${o.cost && !o.paid ? `<button class="btn btn-secondary" data-pay>${icon('dollar')} Pagar desde caja</button>` : ''}
      ${nx ? `<button class="btn btn-primary" data-next>${icon(nx[2])} ${nx[1]}</button>` : ''}`;
    const q = (s) => m.el.querySelector(s);
    m.el.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => { o = await setLabStatus(o, b.dataset.st, b.dataset.st); render(); after?.(); });
    const nb = q('[data-next]'); if (nb) nb.onclick = async () => { o = await setLabStatus(o, nx[0], nx[0]); toast(LAB_STATUS[nx[0]].label); render(); after?.(); };
    const wa = q('[data-wa]'); if (wa) wa.onclick = () => waPatient('laboratorio', { patient: store.patient(o.patientId) || { name: o.patientName, phone: o.patientPhone } });
    const py = q('[data-pay]'); if (py) py.onclick = async (e) => {
      if (!(await requirePin('Pagar al laboratorio desde la caja'))) return;
      setBusy(e.currentTarget, true);
      try { await payLab(o); o = { ...o, paid: true }; toast('Pago registrado como gasto de caja'); render(); after?.(); }
      catch (ex) { toast(ex.message, 'warning'); setBusy(e.currentTarget, false); }
    };
    q('[data-edit]').onclick = async () => { m.close(); const s = await openLabForm({ order: o }); if (s) after?.(); };
  };
  render();
}

export function mount(el) {
  let tab = 'activos'; let q = ''; let hist = null;
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Laboratorio dental</h1><p class="view-sub">Coronas, puentes, prótesis, férulas y aparatos: controla envío, prueba, entrega y pago.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="lb-print">${icon('print')} Imprimir</button><button class="btn btn-primary" id="lb-new">${icon('plus')} Nueva orden</button></div></div>
    <div class="row row-wrap mb" style="gap:10px"><div class="seg" id="lb-tabs"><button data-t="activos">En proceso</button><button data-t="historial">Instalados</button></div><label class="search grow" style="max-width:360px">${icon('search')}<input id="lb-q" placeholder="Paciente, trabajo o laboratorio"></label></div>
    <div id="lb-kpis"></div><div class="card card-flush"><div id="lb-body"></div></div>`;
  const $ = (s) => el.querySelector(s);
  const list = () => {
    const src = tab === 'activos' ? store.labOrders : (hist || []);
    const t = normalize(q);
    return src.filter((o) => !t || normalize(`${o.patientName} ${o.work} ${o.lab} ${o.number}`).includes(t));
  };
  function render() {
    if (!$('#lb-body')) return;
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const act = store.labOrders;
    $('#lb-kpis').innerHTML = `<div class="kpis kpis-sm mb">
      <div class="card kpi"><span class="kpi-label">En el laboratorio</span><div class="kpi-value">${act.filter((o) => o.status === 'enviado').length}</div></div>
      <div class="card kpi"><span class="kpi-label">En prueba</span><div class="kpi-value">${act.filter((o) => o.status === 'prueba').length}</div></div>
      <div class="card kpi"><span class="kpi-label">Listos para instalar</span><div class="kpi-value text-success">${act.filter((o) => o.status === 'recibido').length}</div></div>
      <div class="card kpi"><span class="kpi-label">Atrasados</span><div class="kpi-value ${store.overdueLabs.length ? 'text-danger' : ''}">${store.overdueLabs.length}</div></div>
      <div class="card kpi"><span class="kpi-label">Por pagar al laboratorio</span><div class="kpi-value">${usd(act.filter((o) => !o.paid).reduce((a, o) => a + (o.cost || 0), 0))}</div></div></div>`;
    if (tab === 'historial' && !hist) { $('#lb-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>'; return; }
    const rows = list();
    $('#lb-body').innerHTML = rows.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Orden</th><th>Paciente</th><th>Trabajo</th><th class="hide-sm">Laboratorio</th><th>Entrega</th><th>Estado</th></tr></thead><tbody>
      ${rows.map((o) => `<tr class="click" data-o="${o.id}"><td><b>${esc(o.number)}</b></td><td>${esc(o.patientName)}</td><td><b>${esc(o.work)}</b><div class="t-sub">${esc((o.teeth || []).join(', '))}${o.shade ? ' · ' + esc(o.shade) : ''}</div></td><td class="hide-sm small">${esc(o.lab || '—')}</td><td class="nowrap ${overdue(o) ? 'text-danger bold' : ''}">${fmtDate(o.dueDate)}</td><td>${labBadge(o.status)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:16px">${emptyState('flask', tab === 'activos' ? 'Sin trabajos en proceso' : 'Sin trabajos instalados', 'Crea una orden desde aquí o desde un presupuesto.')}</div>`;
    el.querySelectorAll('[data-o]').forEach((r) => r.onclick = () => openLabOrder(rows.find((o) => o.id === r.dataset.o), () => { hist = null; if (tab === 'historial') loadHist(); render(); }));
  }
  async function loadHist() {
    try { hist = (await store.listEq('lab_orders', 'status', 'instalado')).sort((a, b) => (b.installedAt || '').localeCompare(a.installedAt || '')); } catch (_) { hist = []; }
    render();
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; if (tab === 'historial' && !hist) loadHist(); render(); });
  $('#lb-q').oninput = (e) => { q = e.target.value; render(); };
  $('#lb-new').onclick = () => openLabForm();
  $('#lb-print').onclick = () => printDoc('Trabajos de laboratorio', `<table><thead><tr><th>Orden</th><th>Paciente</th><th>Trabajo</th><th>Dientes</th><th>Laboratorio</th><th>Entrega</th><th>Estado</th></tr></thead><tbody>${list().map((o) => `<tr><td>${esc(o.number)}</td><td>${esc(o.patientName)}</td><td>${esc(o.work)}</td><td>${esc((o.teeth || []).join(', '))}</td><td>${esc(o.lab || '')}</td><td>${fmtDate(o.dueDate)}</td><td>${esc(LAB_STATUS[o.status]?.label || o.status)}</td></tr>`).join('')}</tbody></table>`);
  render();
  return store.on('labs', render);
}
