// Segundo paso de la importación: arma el historial a partir de lo ya importado con import-clinica.mjs
//  · Cada cita atendida → una atención cerrada (Atenciones / historial del paciente), unida al pago del mismo día.
//  · Pacientes con abonos → un presupuesto "en tratamiento" con lo abonado por concepto, unido a sus recibos.
// Uso: node import-historial.mjs [sede01] [--emu] [--dry]
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const DRY = process.argv.includes('--dry');
const CODE = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'sede01';
const accounts = JSON.parse(readFileSync(path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json'), 'utf8'));

const pad = (n, w) => String(n).padStart(w, '0');
const shortId = (n = 6) => randomUUID().replace(/-/g, '').slice(0, n);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sentence = (s) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s; };
const round2 = (v) => Math.round(v * 100) / 100;
const catOf = (n) => {
  const t = norm(n);
  if (/valoracion|consulta|tomografia|radiograf/.test(t)) return 'Diagnóstico';
  if (/limpieza|profilaxis/.test(t)) return 'Prevención';
  if (/resina|restauracion|calza|incrustacion/.test(t)) return 'Operatoria';
  if (/endodoncia|conducto/.test(t)) return 'Endodoncia';
  if (/periodoncia|raspaje|curetaje/.test(t)) return 'Periodoncia';
  if (/extraccion|exodoncia|cordal/.test(t)) return 'Cirugía';
  if (/corona|protesis|placa|puente/.test(t)) return 'Prótesis';
  if (/implante/.test(t)) return 'Implantes';
  if (/ortodoncia|bracket|retenedor|montaje/.test(t)) return 'Ortodoncia';
  if (/blanqueamiento|carilla|sonrisa/.test(t)) return 'Estética';
  return 'Otros';
};
const PHASE = { 'Diagnóstico': 1, 'Prevención': 1, 'Cirugía': 1, 'Endodoncia': 1, 'Operatoria': 2, 'Periodoncia': 2, 'Prótesis': 3, 'Implantes': 3, 'Ortodoncia': 3, 'Estética': 3 };
// "ABONO AL TRATAMIENTO IMPLANTE" → "Tratamiento implante"
function conceptOf(sale) {
  let s = String(sale.items?.[0]?.name || '').replace(/^Abono · /, '').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/^(abonos?|pago|pagos|cancela|cancelaci[oó]n|saldo|segundo|tercer|primer|otro)\s+((a|al|de|del|para|la|el)\s+)?/i, '').trim();
  return sentence(s) || 'Tratamiento odontológico';
}

const app = initializeApp({ apiKey: 'AIzaSyDsoh887DvejhJRDUwNGGA8dxxG4Ru1juw', authDomain: 'sano-dental.firebaseapp.com', projectId: 'sano-dental', appId: '1:8442780228:web:33c1a3ef2cd50d37e3fa11' });
const auth = getAuth(app);
const db = initializeFirestore(app, EMU ? {} : { experimentalForceLongPolling: true });
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9399', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8380); }
await signInWithEmailAndPassword(auth, accounts.admin.email, accounts.admin.password);
const uid = accounts[CODE].uid;
const col = (n) => collection(db, 'tenants', uid, n);
const imp = async (n) => (await getDocs(query(col(n), where('by', '==', 'importacion')))).docs.map((d) => ({ id: d.id, ...d.data() }));

if ((await imp('consultations')).length || (await imp('plans')).length) { console.error('El historial ya fue generado; se cancela para no duplicar.'); process.exit(1); }
const patients = new Map((await getDocs(col('patients'))).docs.filter((d) => d.id.startsWith('cli_')).map((d) => [d.id, { id: d.id, ...d.data() }]));
const appts = await imp('appointments');
const sales = await imp('sales');
console.log(`Leído: ${patients.size} pacientes · ${appts.length} citas · ${sales.length} pagos`);

const ops = []; // [ref, data, merge]
const counters = {};

// ---------- 1) Atenciones desde las citas atendidas ----------
const salesByDay = new Map();
for (const s of sales) { if (!s.patientId) continue; const k = `${s.patientId}|${s.dayKey}`; if (!salesByDay.has(k)) salesByDay.set(k, []); salesByDay.get(k).push(s); }
const usedSales = new Set();
const done = appts.filter((a) => a.status === 'atendida' && a.patientId).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
let con = 0;
for (const a of done) {
  const p = patients.get(a.patientId) || {};
  const ref = doc(col('consultations'));
  con += 1;
  const start = new Date(`${a.date}T${a.time || '08:00'}:00-05:00`);
  const end = new Date(start.getTime() + (Number(a.minutes) || 30) * 60000);
  const daySales = (salesByDay.get(`${a.patientId}|${a.date}`) || []).filter((s) => !usedSales.has(s.id));
  daySales.forEach((s) => usedSales.add(s.id));
  const paid = round2(daySales.reduce((x, s) => x + (Number(s.total) || 0), 0));
  const charges = daySales.map((s) => ({ id: shortId(6), productId: null, name: s.items?.[0]?.name || 'Pago', qty: 1, price: Number(s.total) || 0, cost: 0 }));
  const c = {
    number: `C-${pad(con, 5)}`, seq: con, status: 'cerrada', billing: daySales.length ? 'pagada' : 'importada',
    startedAt: start.toISOString(), updatedAt: end.toISOString(), closedAt: end.toISOString(), closedBy: 'importacion', dayKey: a.date,
    patientId: a.patientId, patientName: p.name || a.patientName, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '', patientSex: p.sex || '', patientBirth: p.birthDate || '', patientBlood: '',
    age: p.age || null, allergies: p.allergies || [], chronic: p.chronic || [], appointmentId: a.id, type: a.type, doctorId: '', doctor: '',
    reason: a.reason || 'Atención', illness: a.notes || '', vitals: {}, exam: '', systems: '', odontogram: null, diagnoses: [], procedures: [], anesthesia: [],
    plan: a.notes ? `Notas del sistema anterior: ${a.notes}` : 'Atención registrada en el sistema anterior.', rx: [], indications: '', labs: [], imaging: [], xrayTeeth: [], labNote: '', referral: null, rest: null,
    nextVisit: null, docs: [], addenda: [], charges, total: paid, cost: 0, discount: 0, stockApplied: true, by: 'importacion',
    ...(daySales.length ? { saleId: daySales[0].id, saleNumber: daySales.map((s) => s.number).join(', '), paidAt: daySales[0].date } : {})
  };
  ops.push([ref, c, false]);
  ops.push([doc(col('appointments'), a.id), { consultationId: ref.id, consultationNumber: c.number }, true]);
  for (const s of daySales) ops.push([doc(col('sales'), s.id), { consultationId: ref.id, consultationNumber: c.number }, true]);
  const pt = patients.get(a.patientId); if (pt) pt.lastConsultId = ref.id;
}
counters.con = con;

// ---------- 2) Presupuestos desde los abonos ----------
const byPatient = new Map();
for (const s of sales) { if (!s.patientId) continue; if (!byPatient.has(s.patientId)) byPatient.set(s.patientId, []); byPatient.get(s.patientId).push(s); }
let planSeq = 0;
for (const [pid, list] of [...byPatient.entries()].sort((a, b) => (patients.get(a[0])?.seq || 0) - (patients.get(b[0])?.seq || 0))) {
  if (!list.some((s) => s.kind === 'abono')) continue; // solo quienes pagaban por abonos
  list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const p = patients.get(pid) || {};
  const groups = new Map();
  for (const s of list) {
    const name = conceptOf(s); const k = norm(name);
    if (!groups.has(k)) groups.set(k, { name, total: 0, full: true, sales: [] });
    const g = groups.get(k); g.total = round2(g.total + (Number(s.total) || 0)); g.sales.push(s); if (s.kind === 'abono') g.full = false;
  }
  const items = [...groups.values()].map((g) => ({
    id: shortId(6), code: '', name: g.name, cat: catOf(g.name), tooth: null, surfaces: [], qty: 1, price: g.total, phase: PHASE[catOf(g.name)] || 2,
    note: `Lo pagado en el sistema anterior (${g.sales.map((s) => s.number).join(', ')}). Ajusta el precio total si falta por pagar.`,
    status: g.full ? 'realizado' : 'pendiente', ...(g.full ? { doneAt: g.sales.at(-1).date, doneBy: 'Sistema anterior' } : {})
  }));
  planSeq += 1;
  const ref = doc(col('plans'));
  const number = `P-${pad(planSeq, 4)}`;
  const paid = round2(list.reduce((x, s) => x + (Number(s.total) || 0), 0));
  const created = list[0].date;
  const subtotal = round2(items.reduce((x, i) => x + i.price, 0));
  const executed = round2(items.filter((i) => i.status === 'realizado').reduce((x, i) => x + i.price, 0));
  const allDone = items.every((i) => i.status === 'realizado');
  const plan = {
    patientId: pid, patientName: p.name || '', patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '',
    title: 'Tratamiento (sistema anterior)', doctorId: '', doctor: '', items, discount: 0,
    notes: 'Presupuesto armado con los abonos y pagos registrados en el sistema anterior. El sistema anterior no guardaba el valor total del tratamiento: cada tratamiento aparece con lo ya pagado. Si el paciente aún debe, edita el precio para ver su saldo pendiente.',
    validUntil: '', financing: null, odontogram: null, number, seq: planSeq, status: allDone ? 'terminado' : 'en_curso', paid,
    subtotal, total: subtotal, executed, createdAt: created, updatedAt: list.at(-1).date, presentedAt: created, approvedAt: created, lastPaymentAt: list.at(-1).date,
    by: 'importacion', consultationId: null, docs: [],
    history: [{ at: created, note: 'Importado del sistema anterior', by: 'importacion' }, ...list.map((s) => ({ at: s.date, note: `${s.kind === 'abono' ? 'Abono' : 'Pago'} ${s.number}`, by: 'importacion' }))]
  };
  ops.push([ref, plan, false]);
  for (const s of list) ops.push([doc(col('sales'), s.id), { planId: ref.id, planNumber: plan.number }, true]);
}
counters.plan = planSeq;
for (const pt of patients.values()) if (pt.lastConsultId) ops.push([doc(col('patients'), pt.id), { lastConsultId: pt.lastConsultId }, true]);
ops.push([doc(db, 'tenants', uid, 'config', 'counters'), counters, true]);

console.log(`Atenciones: ${con} (con pago el mismo día: ${usedSales.size} recibos) · Presupuestos: ${planSeq}`);
if (DRY) { process.exit(0); }
for (let i = 0; i < ops.length; i += 400) {
  const b = writeBatch(db);
  for (const [ref, data, merge] of ops.slice(i, i + 400)) b.set(ref, data, merge ? { merge: true } : {});
  await b.commit();
  console.log(`  escritos ${Math.min(i + 400, ops.length)}/${ops.length}`);
}
console.log(`✔ Historial listo en ${CODE}`);
await deleteApp(app);
process.exit(0);
