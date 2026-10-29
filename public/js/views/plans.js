// Sano Dental — Presupuestos: planes activos, saldos por cobrar, conversión e historial
import { store, PLAN_STATUS, planBadge } from '../store.js';
import { planTotals } from '../ops.js';
import { esc, usd, emptyState, fmtDate, normalize, todayKey, dayKey, addDays, startOfDay, endOfDay, fromKey, download, toCSV, toast } from '../utils.js';
import { icon } from '../icons.js';
import { openPlan, openPlanEditor } from '../plans.js';
import { waPatient } from '../shared.js';

let state = { tab: 'activos', q: '', from: null, to: null, status: 'all' };

export function mount(el) {
  state.from ||= dayKey(addDays(new Date(), -89)); state.to ||= todayKey();
  let hist = null;
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Presupuestos</h1><p class="view-sub">Planes de tratamiento: preséntalos, cobra abonos y sigue el avance diente por diente.</p></div>
    <div class="view-actions"><button class="btn btn-primary" id="pl-new">${icon('plus')} Nuevo presupuesto</button></div></div>
    <div id="pl-kpis"></div>
    <div class="row row-wrap mb" style="gap:10px"><div class="seg" id="pl-tabs"><button data-t="activos">Activos</button><button data-t="saldos">Con saldo</button><button data-t="historial">Historial</button></div>
      <label class="search grow" style="max-width:340px">${icon('search')}<input id="pl-q" placeholder="Paciente o número" value="${esc(state.q)}"></label><span id="pl-tool" class="row row-wrap" style="gap:6px"></span></div>
    <div class="card card-flush"><div id="pl-body"></div></div>`;
  const $ = (s) => el.querySelector(s);

  async function loadHist() {
    hist = null; render();
    try { hist = (await store.listBetween('plans', 'createdAt', startOfDay(fromKey(state.from)).toISOString(), endOfDay(fromKey(state.to)).toISOString())).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
    catch (e) { hist = []; toast('No se pudo cargar el historial: ' + e.message, 'danger'); }
    render();
  }
  function kpis() {
    const act = store.plans.filter((p) => p.status !== 'borrador');
    const tot = act.reduce((a, p) => { const t = planTotals(p); a.total += t.total; a.paid += t.paid; a.bal += t.balance; a.owed += t.owed; return a; }, { total: 0, paid: 0, bal: 0, owed: 0 });
    const pres = store.plans.filter((p) => p.status === 'presentado');
    let conv = '—';
    if (hist?.length) { const dec = hist.filter((p) => !['borrador', 'presentado', 'anulado'].includes(p.status)); const ok = dec.filter((p) => p.status !== 'rechazado').length; conv = dec.length ? Math.round((ok / dec.length) * 100) + ' %' : '—'; }
    return `<div class="kpis kpis-sm mb">
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Por aprobar</span><span class="kpi-icon tone-info">${icon('clock')}</span></div><div class="kpi-value">${pres.length}</div><div class="kpi-sub">${usd(pres.reduce((a, p) => a + planTotals(p).total, 0))} presentados</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">En tratamiento</span><span class="kpi-icon tone-violet">${icon('tooth')}</span></div><div class="kpi-value">${store.plans.filter((p) => ['aprobado', 'en_curso'].includes(p.status)).length}</div><div class="kpi-sub">${usd(tot.total)} en planes activos</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Saldo por cobrar</span><span class="kpi-icon tone-danger">${icon('wallet')}</span></div><div class="kpi-value">${usd(tot.bal)}</div><div class="kpi-sub">${usd(tot.owed)} de trabajo ya realizado</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Aceptación</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${conv}</div><div class="kpi-sub">${hist ? 'en el período del historial' : 'abre el historial para calcularla'}</div></div>
    </div>`;
  }
  function rowsOf() {
    const t = normalize(state.q);
    let src = state.tab === 'historial' ? (hist || []) : store.plans;
    if (state.tab === 'saldos') src = src.filter((p) => ['aprobado', 'en_curso'].includes(p.status) && planTotals(p).balance > 0.009);
    if (state.tab === 'historial' && state.status !== 'all') src = src.filter((p) => p.status === state.status);
    return src.filter((p) => !t || normalize(`${p.patientName} ${p.number} ${p.title} ${p.patientIdDoc}`).includes(t));
  }
  function render() {
    if (!$('#pl-body')) return;
    $('#pl-kpis').innerHTML = kpis();
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === state.tab));
    $('#pl-tool').innerHTML = state.tab === 'historial' ? `<input class="input input-sm" type="date" id="pl-from" value="${state.from}" style="width:auto"><input class="input input-sm" type="date" id="pl-to" value="${state.to}" style="width:auto"><select class="select select-sm" id="pl-st" style="width:auto"><option value="all">Todos</option>${Object.entries(PLAN_STATUS).map(([k, s]) => `<option value="${k}" ${state.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" id="pl-csv">${icon('download')} CSV</button>` : '';
    if (state.tab === 'historial' && !hist) { $('#pl-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>'; bindTool(); return; }
    const rows = rowsOf();
    $('#pl-body').innerHTML = rows.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Presupuesto</th><th>Paciente</th><th class="hide-sm">Avance</th><th class="r">Total</th><th class="r">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map((p) => { const t = planTotals(p); return `<tr class="click" data-p="${p.id}"><td><b>${esc(p.number)}</b><div class="t-sub">${fmtDate(p.createdAt)}${p.validUntil && p.status === 'presentado' && p.validUntil < todayKey() ? ' · <span class="text-danger">vencido</span>' : ''}</div></td><td><b class="ellipsis">${esc(p.patientName)}</b><div class="t-sub ellipsis">${esc(p.title || '')}</div></td>
        <td class="hide-sm" style="min-width:120px"><div class="progress sm"><i style="width:${t.progress}%"></i></div><div class="t-sub">${t.done}/${t.count}</div></td><td class="r num"><b>${usd(t.total)}</b></td><td class="r num ${t.balance > 0.009 ? 'text-danger' : 'text-success'}">${usd(t.balance)}</td><td>${planBadge(p.status)}</td>
        <td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-wa="${p.id}" title="Enviar por WhatsApp">${icon('whatsapp')}</button></td></tr>`; }).join('')}
    </tbody></table></div>` : `<div style="padding:16px">${emptyState('clipboard', 'Sin presupuestos', state.tab === 'saldos' ? 'Ningún paciente tiene saldo pendiente.' : 'Crea uno desde la ficha del paciente o con el botón “Nuevo presupuesto”.')}</div>`;
    el.querySelectorAll('[data-p]').forEach((r) => r.onclick = async (e) => { if (e.target.closest('[data-wa]')) return; await openPlan(rows.find((p) => p.id === r.dataset.p)); if (state.tab === 'historial') loadHist(); });
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const p = rows.find((x) => x.id === b.dataset.wa); waPatient('presupuesto', { plan: p, patient: store.patient(p.patientId) || {} }); });
    bindTool();
  }
  function bindTool() {
    const f = $('#pl-from'); if (!f) return;
    f.onchange = () => { state.from = f.value; loadHist(); };
    $('#pl-to').onchange = (e) => { state.to = e.target.value; loadHist(); };
    $('#pl-st').onchange = (e) => { state.status = e.target.value; render(); };
    $('#pl-csv').onclick = () => download(`presupuestos-${state.from}-${state.to}.csv`, toCSV([['Número', 'Fecha', 'Paciente', 'Título', 'Estado', 'Total', 'Abonado', 'Saldo', 'Realizados'], ...rowsOf().map((p) => { const t = planTotals(p); return [p.number, fmtDate(p.createdAt), p.patientName, p.title, PLAN_STATUS[p.status]?.label, t.total, t.paid, t.balance, `${t.done}/${t.count}`]; })]));
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { state.tab = b.dataset.t; if (state.tab === 'historial' && !hist) loadHist(); render(); });
  $('#pl-q').oninput = (e) => { state.q = e.target.value; render(); };
  $('#pl-new').onclick = async () => {
    const { pickPatient } = await import('../patient.js');
    const p = await pickPatient({ title: 'Presupuesto para…' });
    if (p) await openPlanEditor({ patient: p, odontogram: p.odontogram });
  };
  render();
  return store.on('plans', render);
}
