// Trae lo más reciente del sistema anterior (base PostgreSQL en Render, exportada a JSON) y lo SUMA a una sede
// que ya está en uso. No borra nada de lo que la sede registró por su cuenta.
//  · Pacientes nuevos (si la sede ya creó al mismo paciente —mismo teléfono, cédula o nombre— se usa el suyo).
//  · Citas nuevas y cambios de estado de las citas ya importadas que nadie tocó.
//  · Pagos nuevos (recibos), unidos a su presupuesto.
//  · Presupuestos reales (cotizaciones) en lugar de los armados desde los abonos.
//  · Atenciones de las citas atendidas nuevas y notas de evolución.
// Uso: node import-render.mjs <render.json> [sede01] [--emu] [--dry]
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, writeBatch, deleteField } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const DRY = process.argv.includes('--dry');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const R = JSON.parse(readFileSync(args[0], 'utf8'));
const CODE = args[1] || 'sede01';
const accounts = JSON.parse(readFileSync(path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json'), 'utf8'));
const NOW = new Date().toISOString();

// ---------- utilidades ----------
const pad = (n, w) => String(n).padStart(w, '0');
const shortId = (n = 6) => randomUUID().replace(/-/g, '').slice(0, n);
const clean = (s) => (s == null ? '' : String(s).trim());
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const digits = (s) => clean(s).replace(/\D/g, '');
const tel10 = (s) => { const d = digits(s); return d.length >= 7 ? d.slice(-10) : ''; };
const round2 = (v) => Math.round(v * 100) / 100;
const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const title = (s) => clean(s).replace(/\s+/g, ' ').toLowerCase().split(' ').map((w, i) => (i && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const sentence = (s) => { s = clean(s).replace(/\s+/g, ' '); return s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s; };
const phone = (s) => clean(s).replace(/[^\d+]/g, '');
const dayOf = (iso) => new Date(new Date(iso).getTime() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Colombia
const isoAt = (day, hm = '12:00') => new Date(`${day}T${(hm || '12:00').padStart(5, '0')}:00-05:00`).toISOString();
const hmToMin = (t) => { const [h, m] = clean(t).split(':').map(Number); return h * 60 + (m || 0); };
const catOf = (n) => {
  const t = norm(n);
  if (/valoracion|consulta|tomografia|radiograf|control/.test(t)) return 'Diagnóstico';
  if (/limpieza|profilaxis|higien|fluor|sellante/.test(t)) return 'Prevención';
  if (/resina|restauracion|calza|incrustacion/.test(t)) return 'Operatoria';
  if (/endodoncia|conducto|perno/.test(t)) return 'Endodoncia';
  if (/periodoncia|raspaje|curetaje/.test(t)) return 'Periodoncia';
  if (/extraccion|exodoncia|cordal|cirugia/.test(t)) return 'Cirugía';
  if (/corona|protesis|placa|puente|provisional|acker|pontico/.test(t)) return 'Prótesis';
  if (/implante/.test(t)) return 'Implantes';
  if (/ortodoncia|bracket|retenedor|montaje/.test(t)) return 'Ortodoncia';
  if (/blanqueamiento|carilla|sonrisa|estetic/.test(t)) return 'Estética';
  return 'Otros';
};
const PHASE = { 'Diagnóstico': 1, 'Prevención': 1, 'Cirugía': 1, 'Endodoncia': 1, 'Operatoria': 2, 'Periodoncia': 2, 'Prótesis': 3, 'Implantes': 3, 'Ortodoncia': 3, 'Estética': 3 };
const typeOf = (t) => {
  t = norm(t);
  if (/control de ortodoncia/.test(t)) return 'ortodoncia';
  if (/valoracion|consulta|revision/.test(t)) return 'primera';
  if (/limpieza|profilaxis/.test(t)) return 'limpieza';
  if (/ortodoncia/.test(t)) return 'ortodoncia';
  if (/extraccion|exodoncia|implante/.test(t)) return 'cirugia';
  return 'tratamiento';
};
const APPT_STATUS = { completed: 'atendida', scheduled: 'programada', no_show: 'no_asistio', cancelled: 'cancelada' };
const STATUS_TXT = { new: 'Nuevo', attended: 'Atendido', scheduled: 'Agendado', agendado: 'Agendado', interested: 'Interesado', not_interested: 'No interesado', rescheduled: 'Reagendado' };
const METHOD = { efectivo: 'efectivo', transferencia: 'transferencia', nequi: 'nequi', tarjeta_debito: 'debito', tarjeta_credito: 'credito', otro: 'transferencia' };

// ---------- Firestore ----------
const app = initializeApp({ apiKey: 'AIzaSyDsoh887DvejhJRDUwNGGA8dxxG4Ru1juw', authDomain: 'sano-dental.firebaseapp.com', projectId: 'sano-dental', appId: '1:8442780228:web:33c1a3ef2cd50d37e3fa11' });
const auth = getAuth(app);
const db = initializeFirestore(app, EMU ? {} : { experimentalForceLongPolling: true });
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9399', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8380); }
await signInWithEmailAndPassword(auth, accounts.admin.email, accounts.admin.password);
const uid = accounts[CODE].uid;
const col = (n) => collection(db, 'tenants', uid, n);
const all = async (n) => (await getDocs(col(n))).docs.map((d) => ({ id: d.id, ...d.data() }));
const [fsPatients, fsAppts, fsSales, fsCons, fsPlans] = await Promise.all(['patients', 'appointments', 'sales', 'consultations', 'plans'].map(all));
const counters = (await getDoc(doc(db, 'tenants', uid, 'config', 'counters'))).data() || {};
const settings = (await getDoc(doc(db, 'tenants', uid, 'config', 'settings'))).data() || {};
const IMPORTED_AT = '2026-10-30T00:00:00Z'; // lo importado antes y modificado después de esta fecha no se toca
const seq = { hc: Number(counters.hc) || 0, inv: Number(counters.inv) || 0, con: Number(counters.con) || 0, plan: Number(counters.plan) || 0 };
const ops = []; // [ref, data, merge]
const report = { pacientesNuevos: 0, pacientesUnidos: [], pacientesActualizados: 0, posiblesDuplicados: [], citasNuevas: 0, citasOmitidas: 0, citasActualizadas: 0, pagosNuevos: 0, presupuestos: 0, presupuestosBorrados: 0, atenciones: 0, notas: 0 };

// ---------- 1) Pacientes ----------
const own = fsPatients.filter((p) => !p.id.startsWith('cli_'));
const byTel = new Map(), byDoc = new Map(), byName = new Map();
for (const p of own) {
  if (tel10(p.phone)) byTel.set(tel10(p.phone), p);
  if (digits(p.idDoc).length >= 5) byDoc.set(digits(p.idDoc), p);
  if (norm(p.name)) byName.set(norm(p.name), p);
}
const fsById = new Map(fsPatients.map((p) => [p.id, p]));
const pmap = new Map(); // id de Render → paciente (doc de Firestore)
const pstat = new Map(); // id de doc → { visits, spent, last }
const bump = (pid, { visit = 0, spent = 0, at = null } = {}) => {
  const s = pstat.get(pid) || { visits: 0, spent: 0, last: null };
  s.visits += visit; s.spent += spent; if (at && (!s.last || at > s.last)) s.last = at;
  pstat.set(pid, s);
};
function notesOf(r, created) {
  return [
    r.medical_history && `Notas clínicas: ${clean(r.medical_history)}`,
    r.notes && `Notas: ${clean(r.notes)}`,
    r.treatment && `Tratamiento de interés: ${clean(r.treatment)}`,
    r.treatment_price && `Valor del tratamiento informado: $${Number(r.treatment_price).toLocaleString('es-CO')}`,
    r.age && `Edad al registrarse: ${r.age} años (${created.slice(0, 10).split('-').reverse().join('/')}); la fecha de nacimiento es aproximada, corrígela en Editar`,
    r.status && `Estado en el sistema anterior: ${STATUS_TXT[r.status] || r.status}`,
    r.neighborhood && `Barrio: ${clean(r.neighborhood)}`,
    `Importado del sistema anterior (ID ${r.id}).`
  ].filter(Boolean).join('\n');
}
for (const r of R.patients) {
  const id = 'cli_' + r.id;
  if (fsById.has(id)) {
    // Ya importado: completar datos que antes faltaban (sin pisar lo que ya tiene)
    const p = fsById.get(id); pmap.set(r.id, p);
    if ((p.updatedAt || '') > IMPORTED_AT) continue;
    const patch = {};
    const ced = digits(r.cedula), tel = phone(r.phone), mail = clean(r.email).toLowerCase();
    if (!p.idDoc && ced) patch.idDoc = ced;
    if (!p.phone && tel) patch.phone = tel;
    if (!p.email && mail) patch.email = mail;
    if (!p.referredBy && clean(r.referral_source)) patch.referredBy = clean(r.referral_source);
    const extra = [r.medical_history, r.notes].map(clean).filter((t) => t && !(p.notes || '').includes(t));
    if (extra.length) patch.notes = `${p.notes || ''}\nActualización del sistema anterior: ${extra.join(' · ')}`.trim();
    if (r.status && r.status !== p.legacyStatus) { patch.legacyStatus = r.status; patch.notes = (patch.notes || p.notes || '').replace(/Estado en el sistema anterior: .*/, `Estado en el sistema anterior: ${STATUS_TXT[r.status] || r.status}`); }
    if (Object.keys(patch).length) { ops.push([doc(col('patients'), id), { ...patch, updatedAt: NOW }, true]); report.pacientesActualizados += 1; }
    continue;
  }
  // ¿La sede ya lo registró por su cuenta?
  const match = (tel10(r.phone) && byTel.get(tel10(r.phone))) || (digits(r.cedula).length >= 5 && byDoc.get(digits(r.cedula))) || byName.get(norm(r.name));
  if (match) { pmap.set(r.id, match); report.pacientesUnidos.push(`${clean(r.name)} → ${match.number || ''} ${match.name}`); continue; }
  // Paciente nuevo
  let rawName = clean(r.name); let tel = phone(r.phone);
  const inName = rawName.match(/\+?\d[\d\s-]{6,}\d/);
  if (inName) { rawName = rawName.replace(inName[0], ' ').trim(); if (!tel) tel = phone(inName[0]); }
  const created = r.created_at ? new Date(r.created_at + (r.created_at.endsWith('Z') ? '' : 'Z')).toISOString() : NOW;
  const all2 = norm(`${r.notes} ${r.medical_history}`);
  const chronic = [];
  if (/diabet/.test(all2)) chronic.push('Diabetes');
  if (/hiperten/.test(all2)) chronic.push('Hipertensión arterial');
  const allergyNote = `${clean(r.notes)}\n${clean(r.medical_history)}`.split(/\n/).filter((l) => /alerg/i.test(l)).map((l) => l.trim()).join(' · ');
  const age = Number(r.age) || 0;
  const birthDate = age > 0 && age < 110 ? `${Number(created.slice(0, 4)) - age}-${created.slice(5, 10)}` : '';
  seq.hc += 1;
  const data = {
    name: title(rawName) || `Paciente ${r.id}`, idDoc: digits(r.cedula), birthDate, birthDateApprox: !!birthDate, sex: '',
    phone: tel, phone2: '', email: clean(r.email).toLowerCase(), address: '', city: r.city ? 'Medellín' : '', occupation: '',
    civilStatus: '', bloodType: '', allergies: [], allergyNote, chronic, personalHistory: '', surgicalHistory: '', familyHistory: '', currentMeds: '',
    insurance: '', insuranceNumber: '', emergencyName: '', emergencyPhone: '', referredBy: clean(r.referral_source), notes: notesOf(r, created), habits: {}, dental: {},
    age: age || null, legacyId: r.id, legacyStatus: r.status || '', number: `HC-${pad(seq.hc, 4)}`, seq: seq.hc, active: true, visits: 0, totalSpent: 0, lastVisitAt: null,
    createdAt: created, updatedAt: NOW, by: 'importacion'
  };
  ops.push([doc(col('patients'), id), data, false]);
  const p = { id, ...data }; pmap.set(r.id, p); fsById.set(id, p); report.pacientesNuevos += 1;
}
// Pacientes que la sede creó y que ya existían importados (posible duplicado: solo se avisa)
const cliByTel = new Map(fsPatients.filter((p) => p.id.startsWith('cli_') && tel10(p.phone)).map((p) => [tel10(p.phone), p]));
for (const p of own) { const m = tel10(p.phone) && cliByTel.get(tel10(p.phone)); if (m) report.posiblesDuplicados.push(`${p.number} ${p.name} = ${m.number} ${m.name}`); }

// ---------- 2) Citas ----------
const apptByLegacy = new Map(fsAppts.filter((a) => a.legacyId != null).map((a) => [a.legacyId, a]));
const ownApptKey = new Set(fsAppts.filter((a) => a.by !== 'importacion').map((a) => `${a.patientId}|${a.date}`));
const newCompleted = []; // citas atendidas que necesitan su atención
for (const c of R.appointments) {
  const p = pmap.get(c.patient_id); if (!p) continue;
  const status = APPT_STATUS[c.status] || 'programada';
  const day = clean(c.date).slice(0, 10); const start = clean(c.start_time) || '08:00'; const end = clean(c.end_time);
  const at = isoAt(day, start);
  const prev = apptByLegacy.get(c.id);
  if (prev) {
    if ((prev.updatedAt || '') > IMPORTED_AT) continue; // la sede ya la trabajó
    const patch = {};
    if (prev.status !== status) { patch.status = status; patch.history = [...(prev.history || []), { at: NOW, note: `Estado actualizado desde el sistema anterior: ${status}`, by: 'importacion' }]; }
    if (prev.date !== day || prev.time !== start) { patch.date = day; patch.time = start; }
    if (clean(c.notes) && clean(c.notes) !== prev.notes) patch.notes = clean(c.notes);
    if (Object.keys(patch).length) {
      ops.push([doc(col('appointments'), prev.id), { ...patch, updatedAt: NOW }, true]); report.citasActualizadas += 1;
      if (status === 'atendida' && prev.status !== 'atendida' && !prev.consultationId) { newCompleted.push({ ...prev, ...patch, id: prev.id }); bump(p.id, { visit: 1, at }); }
    }
    continue;
  }
  if (ownApptKey.has(`${p.id}|${day}`)) { report.citasOmitidas += 1; continue; } // la sede ya la agendó
  const created = c.created_at ? new Date(c.created_at + 'Z').toISOString() : at;
  const hist = [{ at: created, note: 'Cita agendada (sistema anterior)', by: 'importacion' }];
  if (status !== 'programada') hist.push({ at, note: { atendida: 'Atendida', no_asistio: 'No asistió', cancelada: 'Cancelada' }[status], by: 'importacion' });
  const ref = doc(col('appointments'));
  const a = {
    patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', date: day, time: start,
    minutes: end ? Math.max(15, hmToMin(end) - hmToMin(start)) : 30, type: typeOf(c.treatment), reason: clean(c.treatment) || 'Cita', doctorId: '', doctor: '',
    notes: clean(c.notes), status, createdAt: created, updatedAt: NOW, by: 'importacion', consultationId: null, reminded: false, history: hist, legacyId: c.id,
    ...(status === 'atendida' ? { arrivedAt: at, attendedAt: at } : {})
  };
  ops.push([ref, a, false]); report.citasNuevas += 1;
  if (status === 'atendida') { newCompleted.push({ id: ref.id, ...a }); bump(p.id, { visit: 1, at }); }
}

// ---------- 3) Presupuestos reales (cotizaciones) ----------
const synthetic = fsPlans.filter((pl) => pl.by === 'importacion' && pl.title === 'Tratamiento (sistema anterior)' && (pl.updatedAt || '') <= IMPORTED_AT + 'x');
const synthIds = new Set(synthetic.map((pl) => pl.id));
for (const pl of synthetic) ops.push([doc(col('plans'), pl.id), null, 'delete']);
report.presupuestosBorrados = synthetic.length;
const qPays = new Map();
for (const pay of R.payments) if (pay.quotation_id) { if (!qPays.has(pay.quotation_id)) qPays.set(pay.quotation_id, []); qPays.get(pay.quotation_id).push(pay); }
const planOf = new Map(); // id de cotización → { ref, number }
for (const q of [...R.quotations].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
  const p = pmap.get(q.patient_id); if (!p) continue;
  const had = fsPlans.find((x) => x.legacyId === q.id); if (had) { planOf.set(q.id, { ref: doc(col('plans'), had.id), number: had.number }); continue; } // ya traído antes
  const pays = qPays.get(q.id) || [];
  const paid = round2(pays.reduce((x, y) => x + (Number(y.amount) || 0), 0));
  const created = new Date(q.created_at + 'Z').toISOString();
  const items = (q.items || []).filter((i) => clean(i.service)).map((i) => {
    const name = sentence(i.service); const cat = catOf(name);
    return { id: shortId(6), code: '', name, cat, tooth: null, surfaces: [], qty: Number(i.quantity) || 1, price: Number(i.price) || 0, phase: PHASE[cat] || 2, note: '', status: 'pendiente' };
  });
  const subtotal = round2(items.reduce((x, i) => x + i.price * i.qty, 0));
  const total = Number(q.total) || subtotal;
  const discount = round2(Math.max(0, subtotal - total));
  const fullyPaid = paid > 0 && paid >= total - 0.5;
  if (fullyPaid) items.forEach((i) => Object.assign(i, { status: 'realizado', doneAt: new Date(pays.at(-1).payment_date + 'T17:00:00Z').toISOString(), doneBy: 'Sistema anterior' }));
  const status = q.status === 'draft' && !paid ? 'borrador' : fullyPaid ? 'terminado' : paid > 0 ? 'en_curso' : 'presentado';
  seq.plan += 1;
  const ref = doc(col('plans')); const number = `P-${pad(seq.plan, 4)}`;
  const executed = fullyPaid ? total : 0;
  ops.push([ref, {
    patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '',
    title: sentence(items[0]?.name ? (items.length > 1 ? `${items[0].name} y ${items.length - 1} más` : items[0].name) : 'Plan de tratamiento'),
    doctorId: '', doctor: '', items, discount, notes: clean(q.observations), validUntil: '', financing: null, odontogram: null,
    number, seq: seq.plan, status, paid, subtotal, total, executed, createdAt: created, updatedAt: NOW, presentedAt: created,
    ...(paid > 0 ? { approvedAt: created, lastPaymentAt: new Date(pays.at(-1).payment_date + 'T17:00:00Z').toISOString() } : {}),
    by: 'importacion', consultationId: null, docs: [], legacyId: q.id,
    history: [{ at: created, note: 'Presupuesto del sistema anterior', by: 'importacion' }]
  }, false]);
  planOf.set(q.id, { ref, number }); report.presupuestos += 1;
}

// ---------- 4) Pagos ----------
const saleByLegacy = new Map(fsSales.filter((s) => s.legacyId != null).map((s) => [s.legacyId, s]));
const salesByDay = new Map(); // ventas sin atención, para unirlas a la atención del mismo día
const addDay = (s, ref) => { if (s.consultationId || !s.patientId) return; const k = `${s.patientId}|${s.dayKey}`; if (!salesByDay.has(k)) salesByDay.set(k, []); salesByDay.get(k).push({ ref, ...s }); };
for (const s of fsSales) if (s.by === 'importacion') addDay(s, doc(col('sales'), s.id));
for (const r of [...R.payments].sort((a, b) => (a.payment_date + pad(a.id, 6)).localeCompare(b.payment_date + pad(b.id, 6)))) {
  const p = pmap.get(r.patient_id); if (!p) continue;
  const pl = r.quotation_id ? planOf.get(r.quotation_id) : null;
  const prev = saleByLegacy.get(r.id);
  if (prev) {
    // Ya estaba: solo se une a su presupuesto real
    const patch = pl ? { planId: pl.ref.id, planNumber: pl.number } : (prev.planId && synthIds.has(prev.planId) ? { planId: deleteField(), planNumber: deleteField() } : null);
    if (patch) ops.push([doc(col('sales'), prev.id), patch, true]);
    continue;
  }
  const amt = Number(r.amount) || 0; const method = METHOD[r.payment_method] || 'efectivo';
  const day = clean(r.payment_date).slice(0, 10); const date = isoAt(day, '12:00');
  const abono = r.payment_type === 'abono' || !!pl;
  const concept = clean(r.concept).replace(/^Abono\s*[—-]\s*/i, '') || clean(r.treatment_name) || 'Tratamiento odontológico';
  seq.inv += 1;
  const ref = doc(col('sales'));
  const s = {
    number: `F-${pad(seq.inv, 6)}`, seq: seq.inv, kind: abono ? 'abono' : 'servicio', date, dayKey: day,
    items: [{ id: shortId(6), productId: null, name: (abono ? 'Abono · ' : '') + concept, qty: 1, price: amt, cost: 0, total: amt }],
    subtotal: amt, discount: 0, total: amt, cost: 0, totalBs: 0, rate: 1, payments: [{ method, currency: 'COP', amount: amt, usd: amt }], paidUSD: amt, changeUSD: 0, changeCurrency: 'USD', method, received: amt,
    shiftId: null, cashFlow: { inUSD: method === 'efectivo' ? amt : 0, inBs: 0, outUSD: 0, outBs: 0 },
    patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', doctorId: '', doctor: '', status: 'completed',
    notes: [clean(r.notes), r.payment_method === 'otro' ? 'Forma de pago registrada como "otro" en el sistema anterior.' : ''].filter(Boolean).join(' · '),
    by: 'importacion', legacyId: r.id, ...(pl ? { planId: pl.ref.id, planNumber: pl.number } : {})
  };
  ops.push([ref, s, false]); report.pagosNuevos += 1;
  bump(p.id, { spent: amt, at: date });
  addDay(s, ref);
}

// ---------- 5) Atenciones de las citas atendidas nuevas + notas de evolución ----------
const evoByDay = new Map();
const evoDone = fsCons.some((c) => /Evolución \(/.test(c.plan || '') || (c.addenda || []).some((a) => /Evolución/.test(a.text || '')));
for (const n of evoDone ? [] : R.evolution_notes) { const p = pmap.get(n.patient_id); if (!p) continue; const k = `${p.id}|${dayOf(n.created_at + 'Z')}`; if (!evoByDay.has(k)) evoByDay.set(k, []); evoByDay.get(k).push(n); }
const consByDay = new Map(fsCons.map((c) => [`${c.patientId}|${c.dayKey}`, c]));
const usedEvo = new Set();
const mkCons = ({ p, day, time = '12:00', minutes = 30, type = 'tratamiento', reason, notes = '', apptId = null, evo = [] }) => {
  const start = new Date(isoAt(day, time)); const end = new Date(start.getTime() + minutes * 60000);
  const k = `${p.id}|${day}`; const sales = (salesByDay.get(k) || []).splice(0);
  const evoTxt = evo.map((n) => `Evolución${n.doctor_name ? ` (${n.doctor_name})` : ''}: ${clean(n.content)}`).join('\n');
  seq.con += 1;
  const ref = doc(col('consultations')); const number = `C-${pad(seq.con, 5)}`;
  ops.push([ref, {
    number, seq: seq.con, status: 'cerrada', billing: sales.length ? 'pagada' : 'importada', startedAt: start.toISOString(), updatedAt: end.toISOString(), closedAt: end.toISOString(), closedBy: 'importacion', dayKey: day,
    patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '', patientSex: p.sex || '', patientBirth: p.birthDate || '', patientBlood: '',
    age: p.age || null, allergies: p.allergies || [], chronic: p.chronic || [], appointmentId: apptId, type, doctorId: '', doctor: evo[0]?.doctor_name || '',
    reason, illness: notes, vitals: {}, exam: '', systems: '', odontogram: null, diagnoses: [], procedures: [], anesthesia: [],
    plan: [notes && `Notas del sistema anterior: ${notes}`, evoTxt].filter(Boolean).join('\n') || 'Atención registrada en el sistema anterior.',
    rx: [], indications: '', labs: [], imaging: [], xrayTeeth: [], labNote: '', referral: null, rest: null, nextVisit: null, docs: [], addenda: [],
    charges: sales.map((s) => ({ id: shortId(6), productId: null, name: s.items?.[0]?.name || 'Pago', qty: 1, price: Number(s.total) || 0, cost: 0 })),
    total: round2(sales.reduce((x, s) => x + (Number(s.total) || 0), 0)), cost: 0, discount: 0, stockApplied: true, by: 'importacion',
    ...(sales.length ? { saleId: sales[0].ref.id, saleNumber: sales.map((s) => s.number).join(', '), paidAt: sales[0].date } : {})
  }, false]);
  for (const s of sales) ops.push([s.ref, { consultationId: ref.id, consultationNumber: number }, true]);
  if (apptId) ops.push([doc(col('appointments'), apptId), { consultationId: ref.id, consultationNumber: number }, true]);
  consByDay.set(k, { id: ref.id }); report.atenciones += 1;
  return ref;
};
for (const a of newCompleted.sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`))) {
  const p = fsById.get(a.patientId) || { id: a.patientId, name: a.patientName };
  const k = `${p.id}|${a.date}`; const evo = evoByDay.get(k) || []; evo.forEach((n) => usedEvo.add(n.id));
  mkCons({ p, day: a.date, time: a.time, minutes: a.minutes, type: a.type, reason: a.reason, notes: a.notes, apptId: a.id, evo });
}
// Notas de evolución restantes: se agregan a la atención de ese día o se crea una
for (const [k, list] of evoByDay) {
  const rest = list.filter((n) => !usedEvo.has(n.id)); if (!rest.length) continue;
  const [pid, day] = k.split('|'); const ex = consByDay.get(k);
  const txt = rest.map((n) => `Evolución${n.doctor_name ? ` (${n.doctor_name})` : ''}: ${clean(n.content)}`).join('\n');
  if (ex && ex.by === 'importacion' && (ex.updatedAt || '') <= IMPORTED_AT) ops.push([doc(col('consultations'), ex.id), { plan: `${ex.plan || ''}\n${txt}`.trim() }, true]);
  else if (ex && ex.by !== 'importacion' && ex.addenda) ops.push([doc(col('consultations'), ex.id), { addenda: [...ex.addenda, { at: NOW, text: `Del sistema anterior: ${txt}`, by: 'importacion' }] }, true]);
  else if (!ex) mkCons({ p: fsById.get(pid) || { id: pid }, day, reason: 'Nota de evolución', evo: rest });
  report.notas += rest.length;
}
report.notas += usedEvo.size;

// ---------- 6) Totales de cada paciente, contadores y datos del consultorio ----------
for (const [pid, s] of pstat) {
  const p = fsById.get(pid); if (!p) continue;
  ops.push([doc(col('patients'), pid), { visits: (Number(p.visits) || 0) + s.visits, totalSpent: round2((Number(p.totalSpent) || 0) + s.spent), lastVisitAt: !p.lastVisitAt || (s.last && s.last > p.lastVisitAt) ? s.last : p.lastVisitAt }, true]);
}
ops.push([doc(db, 'tenants', uid, 'config', 'counters'), seq, true]);
const st = R.settings?.[0];
if (st && !settings.address && st.clinic_address) ops.push([doc(db, 'tenants', uid, 'config', 'settings'), { address: st.clinic_address }, true]);

console.log(JSON.stringify({ ...report, pacientesUnidos: report.pacientesUnidos.length, posiblesDuplicados: report.posiblesDuplicados.length, contadores: seq, escrituras: ops.length }, null, 1));
if (report.pacientesUnidos.length) console.log('Unidos a pacientes que la sede ya había creado:\n  ' + report.pacientesUnidos.join('\n  '));
if (report.posiblesDuplicados.length) console.log('Posibles duplicados creados en la sede (no se tocan):\n  ' + report.posiblesDuplicados.join('\n  '));
if (DRY) process.exit(0);
for (let i = 0; i < ops.length; i += 400) {
  const b = writeBatch(db);
  for (const [ref, data, mode] of ops.slice(i, i + 400)) { if (mode === 'delete') b.delete(ref); else b.set(ref, data, mode ? { merge: true } : {}); }
  await b.commit();
  console.log(`  escritos ${Math.min(i + 400, ops.length)}/${ops.length}`);
}
console.log(`✔ Datos del sistema anterior sumados a ${CODE}`);
await deleteApp(app);
process.exit(0);
