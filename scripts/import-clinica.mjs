// Importa la base de datos de una clínica (Excel convertido a JSON) a una sede.
// Uso: node import-clinica.mjs <datos.json> [sede01] [--emu] [--dry]
// Hojas: Pacientes, Citas, Tratamientos, Pagos_Abonos. Las conversaciones de WhatsApp NO se importan.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const DRY = process.argv.includes('--dry');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DATA = JSON.parse(readFileSync(args[0], 'utf8'));
const CODE = args[1] || 'sede01';
const accounts = JSON.parse(readFileSync(path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json'), 'utf8'));

// El arancel base sale de public/js/clinical.js (se copia a un módulo temporal para poder importarlo en Node)
const tmp = path.join(here, '..', '.tmp', 'mod');
mkdirSync(tmp, { recursive: true });
writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
for (const f of ['clinical.js', 'utils.js', 'icons.js']) copyFileSync(path.join(here, '..', 'public', 'js', f), path.join(tmp, f));
globalThis.document ??= { addEventListener() {}, documentElement: { style: { setProperty() {} } } };
globalThis.window ??= globalThis;
const { DEFAULT_PROCEDURES } = await import(pathToFileURL(path.join(tmp, 'clinical.js')).href);
const { niceMoney, USD_FX } = await import(pathToFileURL(path.join(tmp, 'utils.js')).href);

// ---------- utilidades ----------
const CUR = 'COP';
const toCOP = (usd) => niceMoney(usd * USD_FX[CUR], 0);
const pad = (n, w) => String(n).padStart(w, '0');
const fmtSeq = (p, n, w) => `${p}-${pad(n, w)}`;
const shortId = (n = 6) => randomUUID().replace(/-/g, '').slice(0, n);
const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const title = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map((w, i) => (i && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
const clean = (s) => (s == null ? '' : String(s).trim());
const phone = (s) => clean(s).replace(/[^\d+]/g, '');
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "29/8/2026, 4:11:14 p. m." → ISO (hora de Colombia, UTC-5)
function parseFecha(s) {
  const m = clean(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?/i);
  if (!m) return null;
  let h = Number(m[4]); const ap = (m[7] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], h + 5, +m[5], +(m[6] || 0))).toISOString();
}
const isoAt = (day, hm = '12:00') => { const [h, mi] = hm.split(':').map(Number); const [y, mo, d] = day.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, d, h + 5, mi)).toISOString(); };
const hmToMin = (t) => { const [h, m] = clean(t).split(':').map(Number); return h * 60 + (m || 0); };

// ---------- 1) Arancel: el de Sano Dental en COP + los tratamientos propios de la clínica ----------
const catOf = (n) => {
  const t = norm(n);
  if (/valoracion|consulta/.test(t)) return 'Diagnóstico';
  if (/limpieza|profilaxis/.test(t)) return 'Prevención';
  if (/resina|restauracion|rastauracion|calza/.test(t)) return 'Operatoria';
  if (/endodoncia|conducto/.test(t)) return 'Endodoncia';
  if (/periodoncia/.test(t)) return 'Periodoncia';
  if (/extraccion|exodoncia/.test(t)) return 'Cirugía';
  if (/corona|protesis/.test(t)) return 'Prótesis';
  if (/implante/.test(t)) return 'Implantes';
  if (/ortodoncia/.test(t)) return 'Ortodoncia';
  if (/blanqueamiento|carilla|sonrisa/.test(t)) return 'Estética';
  return 'Otros';
};
const unitOf = (n) => (/valoracion|consulta|limpieza|profilaxis|blanqueamiento|ortodoncia|periodoncia|sonrisa/.test(norm(n)) ? 'boca' : 'diente');
// Precios que en el Excel quedaron en miles (141 = $141.000)
const fixPrice = (p) => { p = Number(p) || 0; return p > 0 && p < 1000 ? Math.round(p * 1000) : p; };
const clinic = DATA.Tratamientos.map((t, i) => ({ code: 'C' + pad(i + 1, 2), name: (/[a-záéíóúñ]/.test(t['Tratamiento']) ? clean(t['Tratamiento']) : title(t['Tratamiento'])).replace(/^Rastauracion/, 'Restauración'), cat: catOf(t['Tratamiento']), price: fixPrice(t['Precio Base (COP)']), unit: unitOf(t['Tratamiento']), effect: null }));
const services = [...clinic, ...DEFAULT_PROCEDURES.map((p) => ({ ...p, price: toCOP(p.price) }))];

// ---------- 2) Pacientes ----------
const STATUS_TXT = { new: 'Nuevo', attended: 'Atendido', scheduled: 'Agendado', agendado: 'Agendado', interested: 'Interesado', not_interested: 'No interesado', rescheduled: 'Reagendado' };
const pacs = [...DATA.Pacientes].sort((a, b) => a.ID - b.ID);
const PID = (orig) => 'cli_' + orig;
const patients = new Map();
pacs.forEach((r, i) => {
  const gen = clean(r['Notas Generales']); const med = clean(r['Notas Médicas']);
  const all = norm(gen + ' ' + med);
  const chronic = [];
  if (/diabet/.test(all)) chronic.push('Diabetes');
  if (/hiperten/.test(all)) chronic.push('Hipertensión arterial');
  const allergyNote = (gen + '\n' + med).split(/\n/).filter((l) => /alerg/i.test(l)).map((l) => l.trim()).join(' · ');
  const created = parseFecha(r['Fecha Registro']) || new Date().toISOString();
  const notes = [
    med && `Notas clínicas: ${med}`,
    gen && `Notas: ${gen}`,
    r['Tratamiento Interés'] && `Tratamiento de interés: ${clean(r['Tratamiento Interés'])}`,
    r['Edad'] && `Edad al registrarse: ${r['Edad']} años (${created.slice(0, 10).split('-').reverse().join('/')}); la fecha de nacimiento es aproximada, corrígela en Editar`,
    r['Estado'] && `Estado en el sistema anterior: ${STATUS_TXT[r['Estado']] || r['Estado']}`,
    r['Barrio'] && `Barrio: ${clean(r['Barrio'])}`,
    `Importado del sistema anterior (ID ${r.ID}).`
  ].filter(Boolean).join('\n');
  // Teléfono escrito dentro del nombre ("Adony Ibarguen 3216089292")
  let rawName = clean(r['Nombre']); let tel = phone(r['Teléfono']);
  const inName = rawName.match(/\+?\d[\d\s-]{6,}\d/);
  if (inName) { rawName = rawName.replace(inName[0], ' ').trim(); if (!tel) tel = phone(inName[0]); }
  // Solo hay edad: fecha de nacimiento aproximada (misma fecha del registro, N años antes)
  const age = Number(r['Edad']) || 0;
  const birthDate = age > 0 && age < 110 ? `${Number(created.slice(0, 4)) - age}-${created.slice(5, 10)}` : '';
  patients.set(r.ID, {
    id: PID(r.ID),
    data: {
      name: title(rawName) || `Paciente ${r.ID}`, idDoc: clean(r['Cédula']).replace(/\D/g, ''), birthDate, birthDateApprox: !!birthDate, sex: '',
      phone: tel, phone2: '', email: clean(r['Email']).toLowerCase(), address: '', city: r['Ciudad'] ? 'Medellín' : '', occupation: '',
      civilStatus: '', bloodType: '', allergies: [], allergyNote, chronic, personalHistory: '', surgicalHistory: '', familyHistory: '', currentMeds: '',
      insurance: '', insuranceNumber: '', emergencyName: '', emergencyPhone: '', referredBy: clean(r['Referido Por']), notes, habits: {}, dental: {},
      age: Number(r['Edad']) || null, legacyId: r.ID, legacyStatus: r['Estado'] || '',
      number: fmtSeq('HC', i + 1, 4), seq: i + 1, active: true, visits: 0, totalSpent: 0, lastVisitAt: null,
      createdAt: created, updatedAt: new Date().toISOString(), by: 'importacion'
    }
  });
});

// ---------- 3) Citas ----------
const APPT_STATUS = { completed: 'atendida', scheduled: 'programada', no_show: 'no_asistio', cancelled: 'cancelada' };
const typeOf = (t) => {
  t = norm(t);
  if (/control de ortodoncia/.test(t)) return 'ortodoncia';
  if (/valoracion|consulta|revision/.test(t)) return 'primera';
  if (/limpieza|profilaxis/.test(t)) return 'limpieza';
  if (/ortodoncia/.test(t)) return 'ortodoncia';
  if (/extraccion|exodoncia|implante/.test(t)) return 'cirugia';
  return 'tratamiento';
};
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const appts = DATA.Citas.map((c) => {
  const p = patients.get(c['ID Paciente']);
  let status = APPT_STATUS[c['Estado']] || 'programada';
  const day = clean(c['Fecha Cita']).slice(0, 10);
  // Citas pasadas que quedaron "programadas" en el sistema anterior
  const start = clean(c['Hora Inicio']) || '08:00'; const end = clean(c['Hora Fin']);
  const minutes = end ? Math.max(15, hmToMin(end) - hmToMin(start)) : 30;
  const created = parseFecha(c['Fecha Creación']) || isoAt(day, start);
  const at = isoAt(day, start);
  const hist = [{ at: created, note: 'Cita agendada (sistema anterior)', by: 'importacion' }];
  if (status === 'atendida') hist.push({ at, note: 'Atendida', by: 'importacion' });
  if (status === 'no_asistio') hist.push({ at, note: 'No asistió', by: 'importacion' });
  if (status === 'cancelada') hist.push({ at, note: 'Cancelada', by: 'importacion' });
  if (status === 'atendida' && p) {
    p.data.visits += 1;
    if (!p.data.lastVisitAt || at > p.data.lastVisitAt) p.data.lastVisitAt = at;
  }
  return {
    patientId: p?.id || null, patientName: p?.data.name || title(c['Nombre Paciente']), patientPhone: p?.data.phone || phone(c['Teléfono Paciente']), patientIdDoc: p?.data.idDoc || '',
    date: day, time: start, minutes, type: typeOf(c['Tratamiento']), reason: clean(c['Tratamiento']) || 'Cita', doctorId: '', doctor: '', notes: clean(c['Notas']),
    status, createdAt: created, updatedAt: new Date().toISOString(), by: 'importacion', consultationId: null, reminded: false, history: hist, legacyId: c['ID Cita'],
    ...(status === 'atendida' ? { arrivedAt: at, attendedAt: at } : {})
  };
});

// ---------- 4) Pagos y abonos → ventas ----------
const METHOD = { efectivo: 'efectivo', transferencia: 'transferencia', nequi: 'nequi', tarjeta_debito: 'debito', tarjeta_credito: 'credito', otro: 'transferencia' };
const pays = [...DATA.Pagos_Abonos].sort((a, b) => (clean(a['Fecha Pago']) + pad(a['ID Pago'], 6)).localeCompare(clean(b['Fecha Pago']) + pad(b['ID Pago'], 6)));
const sales = pays.map((r, i) => {
  const p = patients.get(r['ID Paciente']);
  const amt = Number(r['Monto (COP)']) || 0;
  const method = METHOD[r['Método de Pago']] || 'efectivo';
  const abono = r['Tipo de Pago'] === 'abono';
  const concept = clean(r['Concepto / Tratamiento']).replace(/^Abono\s*[—-]\s*/i, '') || 'Tratamiento odontológico';
  const date = isoAt(clean(r['Fecha Pago']).slice(0, 10), '12:00');
  if (p) {
    p.data.totalSpent += amt;
    if (!p.data.lastVisitAt || date > p.data.lastVisitAt) p.data.lastVisitAt = date;
  }
  const payments = [{ method, currency: CUR, amount: amt, usd: amt }];
  const extraNote = r['Método de Pago'] === 'otro' ? 'Forma de pago registrada como "otro" en el sistema anterior.' : '';
  return {
    number: fmtSeq('F', i + 1, 6), seq: i + 1, kind: abono ? 'abono' : 'servicio', date, dayKey: clean(r['Fecha Pago']).slice(0, 10),
    items: [{ id: shortId(6), productId: null, name: (abono ? 'Abono · ' : '') + concept, qty: 1, price: amt, cost: 0, total: amt }],
    subtotal: amt, discount: 0, total: amt, cost: 0, totalBs: 0, rate: 1, payments, paidUSD: amt, changeUSD: 0, changeCurrency: 'USD', method, received: amt,
    shiftId: null, cashFlow: { inUSD: method === 'efectivo' ? amt : 0, inBs: 0, outUSD: 0, outBs: 0 },
    patientId: p?.id || null, patientName: p?.data.name || '', patientPhone: p?.data.phone || '', patientIdDoc: p?.data.idDoc || '', doctorId: '', doctor: '',
    status: 'completed', notes: [clean(r['Notas']), extraNote].filter(Boolean).join(' · '), by: 'importacion', legacyId: r['ID Pago']
  };
});

console.log(`Pacientes ${patients.size} · citas ${appts.length} · pagos ${sales.length} · arancel ${services.length} (${clinic.length} propios)`);
console.log('Total cobrado:', sales.reduce((a, s) => a + s.total, 0).toLocaleString('es-CO'), 'COP');
if (DRY) { console.log(clinic.map((c) => `${c.code} ${c.name} ${c.cat} ${c.price}`).join('\n')); process.exit(0); }

// ---------- Escritura ----------
const app = initializeApp({ apiKey: 'AIzaSyDsoh887DvejhJRDUwNGGA8dxxG4Ru1juw', authDomain: 'sano-dental.firebaseapp.com', projectId: 'sano-dental', appId: '1:8442780228:web:33c1a3ef2cd50d37e3fa11' });
const auth = getAuth(app);
const db = initializeFirestore(app, EMU ? {} : { experimentalForceLongPolling: true });
if (EMU) { connectAuthEmulator(auth, 'http://127.0.0.1:9399', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8380); }
await signInWithEmailAndPassword(auth, accounts.admin.email, accounts.admin.password);
const uid = accounts[CODE].uid;
const T = (...p) => doc(db, 'tenants', uid, ...p);

// No duplicar si ya se importó
const already = await getDocs(collection(db, 'tenants', uid, 'patients'));
if (already.docs.some((d) => d.id.startsWith('cli_'))) { console.error(`${CODE} ya tiene datos importados; se cancela para no duplicar.`); process.exit(1); }

const ops = [];
const settingsSnap = await getDoc(T('config', 'settings'));
ops.push([T('config', 'settings'), { ...(settingsSnap.data() || {}), country: 'CO', currency: CUR, countrySetAt: new Date().toISOString(), services }, false]);
for (const p of patients.values()) ops.push([T('patients', p.id), p.data, false]);
for (const a of appts) ops.push([doc(collection(db, 'tenants', uid, 'appointments')), a, false]);
for (const s of sales) ops.push([doc(collection(db, 'tenants', uid, 'sales')), s, false]);
ops.push([T('config', 'counters'), { hc: patients.size, inv: sales.length }, true]);
for (let i = 0; i < ops.length; i += 400) {
  const b = writeBatch(db);
  for (const [ref, data, merge] of ops.slice(i, i + 400)) b.set(ref, data, merge ? { merge: true } : {});
  await b.commit();
  console.log(`  escritos ${Math.min(i + 400, ops.length)}/${ops.length}`);
}
console.log(`✔ Importación completa en ${CODE} (${uid})`);
await deleteApp(app);
process.exit(0);
