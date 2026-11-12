// Sano Dental — Modo demo (sesión anónima de 30 minutos) con una clínica dental de ejemplo
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS, APPT_TYPES } from './store.js';
import { fmtSeq, itemsTotal, itemsCost, cashFlowOf, methodNet, genCode, planTotals } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, shortId, sha256, scaleUSD, loc } from './utils.js';
import { ageOf, dentitionFor } from './clinical.js';
import { applyEffect, emptyOdo } from './odontogram.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['patients', 'appointments', 'consultations', 'files', 'products', 'sales', 'cash_shifts', 'cash_movements', 'inventory_logs', 'plans', 'lab_orders', 'perio', 'config'];
const BIZ = 'Clínica Dental Sonrisa Plena (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const DOCTORS = [
  { id: 'dsalazar', name: 'Andreína Salazar', sex: 'F', specialty: 'Odontología general', university: 'Universidad Central', idDoc: '15432876', cov: '23.451', mpps: '', phone: '300 555 0101', signature: '', active: true },
  { id: 'dmendez', name: 'Ricardo Méndez', sex: 'M', specialty: 'Endodoncia', university: 'Universidad del Zulia', idDoc: '12345987', cov: '18.902', mpps: '', phone: '300 555 0202', signature: '', active: true },
  { id: 'drivas', name: 'Laura Rivas', sex: 'F', specialty: 'Ortodoncia', university: 'Universidad de Carabobo', idDoc: '17654321', cov: '27.118', mpps: '', phone: '300 555 0303', signature: '', active: true }
];

const yearsAgo = (y, m = 3, d = 12) => { const t = new Date(); return `${t.getFullYear() - y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const birthdayToday = (y) => { const t = new Date(); return `${t.getFullYear() - y}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

// Odontograma inicial: { diente: { s: { superficie: condición }, c: [condiciones del diente] } }
const ODO = {
  maria: { 16: { s: { O: 'caries', M: 'caries' } }, 26: { c: ['endo_indicada'], s: { O: 'caries' } }, 36: { s: { O: 'resina' } }, 46: { s: { O: 'amalgama' } }, 11: { s: { M: 'caries' } } },
  jose: { 18: { c: ['ausente'] }, 28: { c: ['ausente'] }, 36: { c: ['ausente'] }, 46: { c: ['extraccion'] }, 25: { c: ['corona_indicada', 'endodoncia'] }, 14: { s: { O: 'defectuosa' } }, 37: { s: { O: 'amalgama', D: 'amalgama' } }, 47: { s: { O: 'caries' } } },
  carmen: { 21: { c: ['corona'] }, 11: { s: { V: 'resina' } }, 17: { s: { O: 'resina' } }, 27: { s: { O: 'resina' } }, 38: { c: ['no_erupcionado'] }, 48: { c: ['extraccion'] } },
  luis: { 36: { s: { O: 'caries', D: 'caries', V: 'caries' } }, 46: { s: { O: 'sellante' } }, 16: { s: { O: 'sellante' } } },
  ana: { 13: { c: ['ortodoncia'] }, 12: { c: ['ortodoncia'] }, 11: { c: ['ortodoncia'] }, 21: { c: ['ortodoncia'] }, 22: { c: ['ortodoncia'] }, 23: { c: ['ortodoncia'] }, 33: { c: ['ortodoncia'] }, 32: { c: ['ortodoncia'] }, 31: { c: ['ortodoncia'] }, 41: { c: ['ortodoncia'] }, 42: { c: ['ortodoncia'] }, 43: { c: ['ortodoncia'] } },
  pedro: { 15: { c: ['ausente'] }, 16: { c: ['ausente'] }, 17: { c: ['ausente'] }, 25: { c: ['implante'] }, 26: { c: ['ausente'] }, 35: { c: ['pontico'] }, 34: { c: ['corona'] }, 36: { c: ['corona', 'endodoncia'] }, 44: { c: ['movilidad'] }, 31: { c: ['movilidad'] } },
  daniela: { 18: { c: ['no_erupcionado'] }, 28: { c: ['no_erupcionado'] }, 38: { c: ['extraccion'] }, 48: { c: ['extraccion'] }, 24: { s: { D: 'caries' } } },
  santiago: { 54: { s: { O: 'caries' } }, 64: { s: { O: 'caries', M: 'caries' } }, 74: { c: ['endo_indicada'], s: { O: 'caries' } }, 85: { s: { O: 'sellante' } }, 75: { s: { O: 'sellante' } } },
  rosa: { 11: { c: ['removible'] }, 12: { c: ['removible'] }, 21: { c: ['removible'] }, 22: { c: ['removible'] }, 13: { c: ['corona'] }, 23: { c: ['corona'] }, 14: { c: ['ausente'] }, 24: { c: ['ausente'] }, 46: { c: ['ausente'] }, 36: { c: ['ausente'] } },
  miguel: { 11: { c: ['fractura'] }, 21: { s: { M: 'caries', V: 'caries' } }, 37: { c: ['endo_indicada'], s: { O: 'caries', M: 'caries' } }, 47: { s: { O: 'caries' } } },
  valentina: { 12: { c: ['carilla'] }, 11: { c: ['carilla'] }, 21: { c: ['carilla'] }, 22: { c: ['carilla'] } },
  jorge: { 16: { c: ['endodoncia', 'corona'] }, 46: { c: ['endo_indicada'] }, 45: { s: { D: 'caries', O: 'caries' } } },
  isabel: {},
  andres: { 38: { c: ['no_erupcionado'] }, 48: { c: ['no_erupcionado'] }, 26: { s: { O: 'resina' } } }
};
function buildOdo(k, birthDate) {
  const o = emptyOdo(dentitionFor(birthDate));
  for (const [n, t] of Object.entries(ODO[k] || {})) o.teeth[n] = { s: { ...(t.s || {}) }, c: [...(t.c || [])], note: '' };
  o.updatedAt = nowISO();
  return o;
}

// Pacientes con historia médica y odontológica realista
const PATIENTS = [
  { k: 'maria', name: 'María José González', idDoc: '18456789', birthDate: yearsAgo(38, 5, 14), sex: 'F', phone: '300 123 4567', email: 'mariajg@correo.com', address: 'Calle 45 # 12-30', occupation: 'Docente', bloodType: 'O+', allergies: ['Penicilina'], chronic: [], currentMeds: '', dental: { cepillado: '2 veces al día', hilo: 'A veces', sangrado: 'Al cepillarse', sensibilidad: 'Al frío', bruxismo: 'No', ultimaVisita: 'Hace más de 2 años', expectativa: 'Quiere resolver el dolor de la muela superior izquierda.' } },
  { k: 'jose', name: 'José Antonio Rodríguez', idDoc: '9876543', birthDate: yearsAgo(62, 9, 2), sex: 'M', phone: '310 765 4321', address: 'Carrera 8 # 20-15', occupation: 'Comerciante', bloodType: 'A+', allergies: [], chronic: ['Hipertensión arterial', 'Diabetes'], currentMeds: 'Losartán 50 mg c/12 h · Metformina 850 mg c/12 h', habits: { tabaco: 'Ex fumador' }, dental: { cepillado: '1 vez al día', hilo: 'Nunca', sangrado: 'Espontáneo', bruxismo: 'No', expectativa: 'Rehabilitar para poder masticar bien.' } },
  { k: 'carmen', name: 'Carmen Elena Pérez', idDoc: '15998120', birthDate: yearsAgo(45, 1, 23), sex: 'F', phone: '315 555 1234', address: 'Av. Principal, Edif. Mirador, apto 4B', occupation: 'Contadora', bloodType: 'B+', allergies: ['Sulfas'], chronic: ['Hipotiroidismo / hipertiroidismo', 'Bruxismo'], currentMeds: 'Levotiroxina 75 mcg', dental: { cepillado: '3 veces al día', hilo: 'Diario', bruxismo: 'Sí, nocturno', expectativa: 'Mantenimiento y férula para el bruxismo.' } },
  { k: 'luis', name: 'Luis Alberto Hernández', idDoc: '24556001', birthDate: yearsAgo(29, 11, 8), sex: 'M', phone: '316 333 2211', address: 'Conjunto Los Pinos, casa 12', occupation: 'Ingeniero', bloodType: 'O+', allergies: [], chronic: ['Asma'], currentMeds: 'Salbutamol inhalador a demanda', dental: { cepillado: '2 veces al día', sensibilidad: 'Al dulce', expectativa: 'Dolor al masticar del lado izquierdo.' } },
  { k: 'ana', name: 'Ana Gabriela Martínez', idDoc: '22345678', birthDate: birthdayToday(24), sex: 'F', phone: '320 888 9900', address: 'Calle 10 # 5-55', occupation: 'Abogada', bloodType: 'A-', allergies: ['AINES'], chronic: [], dental: { cepillado: '3 veces al día', hilo: 'Diario', expectativa: 'Terminar la ortodoncia con buena estética.' } },
  { k: 'pedro', name: 'Pedro Luis Castillo', idDoc: '7777456', birthDate: yearsAgo(71, 7, 30), sex: 'M', phone: '311 222 3344', address: 'Barrio El Centro, calle 3', occupation: 'Jubilado', bloodType: 'O-', allergies: [], chronic: ['Hipertensión arterial', 'Anticoagulado (warfarina, rivaroxabán…)', 'Cardiopatía'], currentMeds: 'Amlodipino 10 mg · Warfarina 5 mg · Atorvastatina 20 mg', dental: { cepillado: '2 veces al día', sangrado: 'Al cepillarse', expectativa: 'Reponer los dientes superiores derechos.' } },
  { k: 'daniela', name: 'Daniela Suárez', idDoc: '27001552', birthDate: yearsAgo(22, 4, 17), sex: 'F', phone: '312 111 2233', address: 'Residencias Universitarias, torre 2', occupation: 'Estudiante', bloodType: 'O+', allergies: [], chronic: [], dental: { cepillado: '2 veces al día', expectativa: 'Le duelen las cordales inferiores.' } },
  { k: 'santiago', name: 'Santiago Rivas', idDoc: '', birthDate: yearsAgo(7, 6, 5), sex: 'M', phone: '314 987 6543', address: 'Calle 22 # 14-08', occupation: 'Escolar', bloodType: 'A+', allergies: [], chronic: [], guardianName: 'Laura Rivas', guardianId: '19123456', guardianRel: 'Madre', emergencyName: 'Laura Rivas (madre)', emergencyPhone: '314 987 6543', dental: { cepillado: '2 veces al día (supervisado)', habitos: 'Biberón nocturno hasta los 4 años', expectativa: 'Revisión por caries en muelas de leche.' } },
  { k: 'rosa', name: 'Rosa Margarita Lugo', idDoc: '5123456', birthDate: yearsAgo(78, 2, 11), sex: 'F', phone: '313 555 1122', address: 'Calle Real # 4-10', occupation: 'Ama de casa', bloodType: 'B+', allergies: ['Dipirona'], chronic: ['Diabetes', 'Osteoporosis', 'Bifosfonatos / denosumab'], currentMeds: 'Insulina NPH 20 UI · Alendronato semanal', dental: { expectativa: 'La prótesis superior le queda floja.' } },
  { k: 'miguel', name: 'Miguel Ángel Torres', idDoc: '19887766', birthDate: yearsAgo(41, 10, 3), sex: 'M', phone: '317 444 5566', address: 'Urbanización Las Acacias, casa 8', occupation: 'Chofer', bloodType: 'O+', allergies: [], chronic: ['Fumador'], habits: { tabaco: 'Fuma a diario', alcohol: 'Frecuente' }, dental: { cepillado: '1 vez al día', expectativa: 'Se fracturó el diente de adelante en una caída.' } },
  { k: 'valentina', name: 'Valentina Ortega', idDoc: '30112233', birthDate: yearsAgo(26, 8, 21), sex: 'F', phone: '318 777 8899', address: 'Calle 80 # 30-20', occupation: 'Diseñadora', bloodType: 'AB+', allergies: [], chronic: [], dental: { cepillado: '3 veces al día', hilo: 'Diario', expectativa: 'Control de sus carillas y blanqueamiento.' } },
  { k: 'jorge', name: 'Jorge Luis Blanco', idDoc: '14223344', birthDate: yearsAgo(52, 12, 1), sex: 'M', phone: '319 666 7788', address: 'Barrio San José, carrera 5', occupation: 'Mecánico', bloodType: 'A+', allergies: ['Penicilina', 'Látex'], chronic: ['Hipertensión arterial'], currentMeds: 'Enalapril 10 mg c/12 h', dental: { cepillado: '2 veces al día', expectativa: 'Dolor fuerte en muela inferior derecha.' } },
  { k: 'isabel', name: 'Isabel Cristina Mora', idDoc: '20998877', birthDate: yearsAgo(33, 3, 9), sex: 'F', phone: '301 333 4455', address: 'Carrera 15 # 90-12', occupation: 'Arquitecta', bloodType: 'O+', allergies: [], chronic: ['Embarazo'], currentMeds: 'Ácido fólico', dental: { expectativa: 'Limpieza: está embarazada de 5 meses.' } },
  { k: 'andres', name: 'Andrés Felipe Gil', idDoc: '26554433', birthDate: yearsAgo(27, 9, 16), sex: 'M', phone: '302 222 1100', address: 'Calle 7 # 3-45', occupation: 'Programador', bloodType: 'B-', allergies: [], chronic: [], dental: { bruxismo: 'Sí, de día', expectativa: 'Evaluar cordales retenidas.' } }
];

// [nombre, categoría, presentación, costo USD, precio USD, existencia, mínimo, se cobra, lote, días para vencer]
const PRODUCTS = [
  ['Lidocaína 2 % con epinefrina 1:80.000', 'Anestésicos', 'Caja x 50 cartuchos', 0.45, 0, 120, 50, false, 'LD2307', 400],
  ['Mepivacaína 3 % sin vasoconstrictor', 'Anestésicos', 'Caja x 50 cartuchos', 0.55, 0, 30, 40, false, 'MP1188', 45],
  ['Articaína 4 % con epinefrina 1:100.000', 'Anestésicos', 'Caja x 50 cartuchos', 0.7, 0, 60, 30, false, 'AR4410', 300],
  ['Resina compuesta A2 (jeringa 4 g)', 'Resinas y adhesivos', 'Jeringa 4 g', 12, 0, 6, 4, false, 'RA2210', 500],
  ['Resina compuesta A3 (jeringa 4 g)', 'Resinas y adhesivos', 'Jeringa 4 g', 12, 0, 2, 4, false, 'RA3301', 600],
  ['Adhesivo universal', 'Resinas y adhesivos', 'Frasco 5 ml', 28, 0, 3, 2, false, 'AD0921', 25],
  ['Ácido grabador 37 %', 'Resinas y adhesivos', 'Jeringa 3 ml', 3, 0, 8, 4, false, '', 0],
  ['Limas K 15-40 (25 mm)', 'Endodoncia', 'Caja x 6', 6, 0, 10, 4, false, '', 0],
  ['Hipoclorito de sodio 5,25 %', 'Endodoncia', 'Frasco 1 L', 4, 0, 5, 2, false, 'HS5502', 200],
  ['Conos de gutapercha', 'Endodoncia', 'Caja x 120', 7, 0, 4, 2, false, '', 0],
  ['Sutura seda 3-0', 'Cirugía y suturas', 'Sobre', 1.1, 5, 24, 10, true, 'SS3301', 700],
  ['Alginato cromático', 'Impresión y prótesis', 'Bolsa 450 g', 9, 0, 1, 2, false, 'AL7731', 90],
  ['Cepillo dental suave', 'Profilaxis y prevención', 'Unidad', 0.8, 3, 40, 15, true, '', 0],
  ['Kit de blanqueamiento en casa', 'Profilaxis y prevención', 'Kit', 18, 45, 5, 2, true, 'BL0034', -5],
  ['Guantes de nitrilo talla M', 'Bioseguridad', 'Caja x 100', 7, 0, 3, 4, false, '', 0],
  ['Eyectores de saliva', 'Material descartable', 'Bolsa x 100', 3, 0, 6, 3, false, '', 0]
];

export async function createDemoTenant(uid) {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();

  const ref = (name, id) => doc(db, 'tenants', uid, name, id || doc(collection(db, 'tenants', uid, name)).id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: '900.000.000-0', phone: '601 555 0000', whatsapp: '300 000 0000', email: 'demo@sanodental.app',
    address: 'Centro Profesional Sonrisa, piso 3, consultorio 302', instagram: '@sanodental',
    receiptFooter: '¡Gracias por probar Sano Dental! Recuerda tu control de limpieza cada 6 meses.', doctors: DOCTORS,
    schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', slot: 30, breakStart: '12:00', breakEnd: '13:00', sat: true, satStart: '08:00', satEnd: '12:00' },
    favMeds: ['Ibuprofeno', 'Amoxicilina', 'Acetaminofén', 'Clorhexidina']
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}

const at = (daysAgo, h, m = 0) => { const d = addDays(new Date(), -daysAgo); d.setHours(h, m, 0, 0); return d; };
const hm = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const initialsOf = (n) => String(n || '').trim().split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() + '.' : '')).join(' ');

/** Historias con odontograma, presupuestos con abonos, citas en todos los estados, laboratorio, caja e insumos. */
export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const proc = (code) => store.proc(code) || { code, name: code, price: 0 };
  const item = (code, tooth = null, surfaces = [], phase = 1, extra = {}) => { const p = proc(code); return { id: shortId(6), code, name: p.name, cat: p.cat || '', tooth, surfaces, qty: 1, price: Number(p.price) || 0, phase, note: '', status: 'pendiente', ...extra }; };
  const charge = (code) => { const p = proc(code); return { id: shortId(6), productId: null, name: p.name, qty: 1, price: Number(p.price) || 0, cost: 0 }; };

  // 1) Pacientes (con su odontograma) e insumos
  const b0 = store.batch(); const now = nowISO();
  PATIENTS.forEach(({ k, ...p }, i) => {
    const seq = store.nextSeq(b0, 'hc');
    b0.set(store.ref('patients', 'demo_' + k), {
      phone2: '', email: '', city: '', civilStatus: '', personalHistory: '', surgicalHistory: '', familyHistory: '', currentMeds: '', insurance: '', insuranceNumber: '', emergencyName: '', emergencyPhone: '', referredBy: '', notes: '', allergyNote: '', habits: {},
      ...p, odontogram: buildOdo(k, p.birthDate), number: fmtSeq('HC', seq, 4), seq, active: true, visits: 0, totalSpent: 0, lastVisitAt: null,
      createdAt: at(90 - i * 5, 9).toISOString(), updatedAt: now, by: 'demo'
    });
  });
  PRODUCTS.forEach(([name, category, compatible, cost, price, stock, minStock, sellable, lot, expDays]) => b0.set(store.newRef('products'), {
    name, category, compatible, sku: '', cost: money(cost), price: money(price), stock, minStock, supplier: 'Depósito Dental Central', sellable, trackStock: true, active: true, sold: 0,
    lot, expiresAt: expDays ? dayKey(addDays(new Date(), expDays)) : '', createdAt: now, updatedAt: now
  }));
  await store.commit(b0);
  await waitFor(() => store.patients.length >= PATIENTS.length && store.products.length >= PRODUCTS.length);
  const P = (k) => store.patient('demo_' + k) || { id: 'demo_' + k, ...PATIENTS.find((x) => x.k === k) };
  const D = (id) => DOCTORS.find((x) => x.id === id);

  const b = store.batch();

  // 2) Presupuestos en distintos estados
  const plans = {};
  const mkPlan = (k, docId, title, items, { status = 'presentado', daysAgo = 10, discountPct = 0, financing = null, done = [] } = {}) => {
    const p = P(k); const d = D(docId);
    const ref = store.newRef('plans'); const seq = store.nextSeq(b, 'plan');
    items.forEach((it, i) => { if (done.includes(i)) Object.assign(it, { status: 'realizado', doneAt: at(Math.max(0, daysAgo - 3 - i), 10).toISOString(), doneBy: d.name }); });
    const subtotal = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
    const discount = round2(subtotal * discountPct / 100);
    const created = at(daysAgo, 11).toISOString();
    const plan = {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '', title, doctorId: d.id, doctor: d.name, items, discount, notes: '',
      validUntil: dayKey(addDays(new Date(), 30 - daysAgo)), financing, odontogram: null, number: fmtSeq('P', seq, 4), seq, status, paid: 0, createdAt: created, updatedAt: created, by: 'demo', consultationId: null, docs: [],
      presentedAt: created, ...(status !== 'presentado' ? { approvedAt: at(daysAgo - 1, 12).toISOString() } : {}),
      history: [{ at: created, note: 'Presupuesto creado', by: 'demo' }, ...(status !== 'presentado' ? [{ at: at(daysAgo - 1, 12).toISOString(), note: 'Aprobado por el paciente', by: 'demo' }] : [])]
    };
    const t = planTotals(plan); Object.assign(plan, { subtotal: t.subtotal, total: t.total, executed: t.executed });
    plans[k] = { ref, plan };
    return plans[k];
  };
  mkPlan('maria', 'dsalazar', 'Plan de tratamiento integral', [item('PV01', null, [], 1), item('E03', 26, [], 1), item('PR02', 26, [], 2), item('O02', 16, ['O', 'M'], 2), item('O01', 11, ['M'], 2)], { status: 'en_curso', daysAgo: 24, discountPct: 5, done: [0] });
  mkPlan('jose', 'dmendez', 'Rehabilitación oral', [item('C02', 46, [], 1), item('PE01', null, [], 1, { qty: 2 }), item('PR01', 25, [], 2), item('O01', 47, ['O'], 2), item('O03', 14, ['O', 'M', 'D'], 2), item('PR09', null, [], 3)], { status: 'aprobado', daysAgo: 12, discountPct: 10, financing: { months: 4, initial: 0 } });
  mkPlan('luis', 'dsalazar', 'Restauración y prevención', [item('O03', 36, ['O', 'D', 'V'], 1), item('PV01', null, [], 1), item('PV03', null, [], 1)], { status: 'terminado', daysAgo: 20, done: [0, 1, 2] });
  mkPlan('daniela', 'dmendez', 'Cirugía de cordales inferiores', [item('C04', 38, [], 1), item('C04', 48, [], 1), item('D04', 38, [], 1)], { status: 'presentado', daysAgo: 6 });
  mkPlan('santiago', 'dsalazar', 'Odontopediatría', [item('OP01', 74, [], 1), item('OP04', 74, [], 1), item('O05', 54, ['O'], 1), item('O05', 64, ['O', 'M'], 1), item('PV03', null, [], 2)], { status: 'en_curso', daysAgo: 8, done: [0] });
  mkPlan('miguel', 'dsalazar', 'Urgencia y estética anterior', [item('E05', 37, [], 1), item('E03', 37, [], 1), item('PR02', 37, [], 2), item('ES03', 11, ['V'], 2), item('O02', 21, ['M', 'V'], 2), item('ES01', null, [], 3)], { status: 'presentado', daysAgo: 3 });
  mkPlan('ana', 'drivas', 'Ortodoncia con brackets estéticos', [item('OR01', null, [], 1), item('OR03', null, [], 1, { qty: 2 }), ...Array.from({ length: 6 }, () => item('OR04', null, [], 2)), item('OR05', null, [], 3, { qty: 2 })], { status: 'en_curso', daysAgo: 80, discountPct: 8, financing: { months: 12, initial: 0 }, done: [0, 1, 2, 3, 4] });
  mkPlan('jorge', 'dmendez', 'Endodoncia molar', [item('E03', 46, [], 1), item('PR01', 46, [], 2), item('O02', 45, ['D', 'O'], 2)], { status: 'rechazado', daysAgo: 30 });

  // 3) Atenciones anteriores con procedimientos, su cita y su cobro
  //    [paciente, díasAtrás, hora, tipo, odontólogo, motivo, hallazgos, [procedimientos: [código, diente, superficies, idx del plan?]], anestesia, rx, método de pago (o null), abono al plan, indicaciones, diagnósticos]
  const RX = (name, presentation, dose, frequency, duration, route = 'Oral', note = '') => ({ id: shortId(6), name, presentation, dose, frequency, duration, route, family: '', qty: '', note });
  const AN = (k, cartridges, teeth) => [{ k, technique: 'Infiltrativa (supraperióstica)', cartridges: String(cartridges), zone: teeth.join(', ') }];
  const history = [
    ['ana', 78, 15, 'ortodoncia', 'drivas', 'Instalación de brackets', 'Apiñamiento anterior leve.', [['OR03', null, [], 1], ['OR03', null, [], 2]], [], [], 'transferencia', 0.5, 'Dieta blanda los primeros días. Cera ortodóntica si roza.', [['K07.3', 'Anomalías de la posición del diente']]],
    ['ana', 48, 15, 'ortodoncia', 'drivas', 'Control de ortodoncia', 'Buena evolución. Cambio de arco.', [['OR04', null, [], 3]], [], [], 'efectivo', 0.1, '', []],
    ['ana', 18, 15, 'ortodoncia', 'drivas', 'Control de ortodoncia', 'Cierre de espacios.', [['OR04', null, [], 4]], [], [], 'efectivo', 0.1, '', []],
    ['luis', 20, 10, 'tratamiento', 'dsalazar', 'Dolor al masticar', 'Caries profunda en 36 sin compromiso pulpar.', [['O03', 36, ['O', 'D', 'V'], 0]], AN('lido_epi', 1, [36]), [RX('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral', 'Si hay dolor')], 'debito', 'all', 'Evitar alimentos muy duros por 24 horas.', [['K02.1', 'Caries de la dentina', 36]]],
    ['luis', 13, 11, 'limpieza', 'dsalazar', 'Limpieza', 'Cálculo leve inferior anterior.', [['PV01', null, [], 1], ['PV03', null, [], 2]], [], [], null, 0, 'No comer ni beber en 30 minutos por el flúor.', [['K03.6', 'Depósitos en los dientes']]],
    ['maria', 22, 10, 'limpieza', 'dsalazar', 'Limpieza y evaluación', 'Gingivitis leve. Caries en 16 y 11. 26 con dolor a la percusión.', [['PV01', null, [], 0]], [], [RX('Clorhexidina 0,12 %', 'Enjuague 250 ml', '15 ml', 'cada 12 horas', '7 días', 'Enjuague')], 'transferencia', 0.3, 'Usar hilo dental todos los días.', [['K05.1', 'Gingivitis crónica'], ['K04.0', 'Pulpitis', 26]]],
    ['santiago', 6, 16, 'tratamiento', 'dsalazar', 'Dolor en muela de leche', 'Caries profunda en 74 con exposición pulpar.', [['OP01', 74, [], 0]], AN('lido_epi', 0.5, [74]), [RX('Acetaminofén', 'Jarabe 160 mg/5 ml', '7,5 ml', 'cada 6 horas', '2 días', 'Oral', 'Si hay dolor')], 'efectivo', 0.4, 'No morder el labio mientras dure la anestesia.', [['K04.0', 'Pulpitis', 74]]],
    ['jorge', 30, 9, 'urgencia', 'dmendez', 'Dolor fuerte en muela inferior derecha', 'Pulpitis irreversible en 46. Prueba al frío positiva prolongada.', [['E05', 46, [], null]], AN('mepi3', 2, [46]), [RX('Clindamicina', 'Cápsulas 300 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral', 'Alérgico a penicilina'), RX('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '3 días')], 'efectivo', 0, 'Volver para la endodoncia definitiva.', [['K04.0', 'Pulpitis', 46]]],
    ['pedro', 16, 11, 'control', 'dmendez', 'Control de implante', 'Implante 25 estable. Movilidad grado I en 31 y 44.', [['D02', null, [], null], ['D04', 25, [], null]], [], [], 'efectivo', 0, 'Consultar al cardiólogo antes de cualquier extracción (warfarina).', [['K05.3', 'Periodontitis crónica']]],
    ['rosa', 9, 9, 'control', 'dsalazar', 'Prótesis floja', 'Reabsorción de reborde. Se indica rebase.', [['PR10', null, [], null]], [], [], 'transferencia', 0, 'Retirar la prótesis para dormir y limpiarla a diario.', [['K08.1', 'Pérdida de dientes']]],
    ['valentina', 5, 16, 'control', 'dsalazar', 'Control de carillas', 'Carillas en buen estado. Desea blanqueamiento.', [['D02', null, [], null]], [], [], 'efectivo', 0, '', []],
    ['isabel', 2, 10, 'limpieza', 'dsalazar', 'Limpieza (embarazo 2.º trimestre)', 'Gingivitis del embarazo. Sin radiografías.', [['PV01', null, [], null]], [], [], 'transferencia', 0, 'Cepillado suave 3 veces al día.', [['K05.1', 'Gingivitis crónica']]],
    ['andres', 1, 15, 'primera', 'dmendez', 'Evaluación de cordales', 'Cordales 38 y 48 incluidas en posición mesioangular.', [['D01', null, [], null], ['D04', 38, [], null]], [], [], null, 0, '', [['K01.1', 'Dientes impactados', 38]]]
  ];
  const today = [
    ['carmen', 0, 8, 'limpieza', 'dsalazar', 'Limpieza semestral', 'Desgaste por bruxismo. Se indica férula.', [['PV01', null, [], null]], [], [], 'efectivo', 0, 'Usar la férula todas las noches cuando esté lista.', [['F45.8', 'Bruxismo']]],
    ['maria', 0, 9, 'tratamiento', 'dmendez', 'Endodoncia 26', 'Endodoncia multirradicular de 26 en una sesión.', [['E03', 26, [], 1]], AN('arti', 2, [26]), [RX('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral', 'Con comida')], null, 0, 'Evitar masticar del lado izquierdo hasta colocar la corona.', [['K04.0', 'Pulpitis', 26]]]
  ];

  const shiftRef = store.newRef('cash_shifts');
  const opening = money(20);
  const shift = { status: 'open', openedAt: at(0, 7, 45).toISOString(), openedBy: 'demo', dayKey: todayKey(), number: 'T-0001', openingUSD: opening, openingBs: 0, rateAtOpen: 1, inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, expensesUSD: 0, byMethod: {}, note: 'Turno de demostración' };
  b.set(store.ref('config', 'counters'), { shift: 1 }, { merge: true });
  const ptAgg = {};
  let docsLeft = 3;
  const cur = loc().cur;

  const addSale = ({ kind, date, items, total, method, p, d, extra, daysAgo }) => {
    const inv = store.nextSeq(b, 'inv'); const sRef = store.newRef('sales');
    const payments = [{ method, currency: cur, amount: total, usd: total }];
    const flow = cashFlowOf(payments, 0, 'USD', 1);
    const sale = {
      number: fmtSeq('F', inv, 6), seq: inv, kind, date, dayKey: dayKey(new Date(date)), items, subtotal: total, discount: 0, total, cost: itemsCost(items), totalBs: 0,
      rate: 1, payments, paidUSD: total, changeUSD: 0, changeCurrency: 'USD', method, received: total, shiftId: daysAgo === 0 ? shiftRef.id : null, cashFlow: flow,
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', doctorId: d.id, doctor: d.name, status: 'completed', by: 'demo', ...extra
    };
    b.set(sRef, sale);
    if (daysAgo === 0) {
      shift.inUSD += flow.inUSD; shift.salesCount += 1; shift.salesTotal = round2(shift.salesTotal + total);
      Object.entries(methodNet(sale)).forEach(([k, v]) => { shift.byMethod[k] = round2((shift.byMethod[k] || 0) + v); });
    }
    return { sRef, sale };
  };

  const addConsult = ([pk, daysAgo, hour, type, docId, reason, findings, procs, anesthesia, rx, method, abono, ind, dx], idx) => {
    const p = P(pk); const d = D(docId);
    const minute = (idx * 13) % 50;
    const start = at(daysAgo, hour, minute); const end = new Date(start.getTime() + (25 + (idx % 4) * 10) * 60000);
    const date = dayKey(start);
    const aRef = store.newRef('appointments'); const cRef = store.newRef('consultations');
    const seq = store.nextSeq(b, 'con'); const number = fmtSeq('C', seq);
    const pl = plans[pk];
    const procedures = procs.map(([code, tooth, surfaces, planIdx]) => {
      const fromPlan = pl && planIdx != null && pl.plan.items[planIdx];
      const pp = proc(code);
      if (fromPlan) Object.assign(fromPlan, { status: 'realizado', doneAt: end.toISOString(), consultId: cRef.id, consultNumber: number, doneBy: d.name });
      return { id: shortId(6), planId: fromPlan ? pl.ref.id : null, planItemId: fromPlan ? fromPlan.id : null, code, name: pp.name, tooth, surfaces, price: Number(pp.price) || 0, charged: !fromPlan, note: '' };
    });
    const charges = procedures.filter((x) => x.charged).map((x) => ({ id: shortId(6), productId: null, name: x.name + (x.tooth ? ` (${x.tooth})` : ''), qty: 1, price: x.price, cost: 0 }));
    if (!charges.length && !procedures.some((x) => x.planId)) charges.push(charge('D02'));
    const total = itemsTotal(charges);
    const billing = !charges.length ? 'sin_cargo' : method ? 'pagada' : 'pendiente';
    const c = {
      number, seq, status: 'cerrada', billing, startedAt: start.toISOString(), updatedAt: end.toISOString(), closedAt: end.toISOString(), closedBy: 'demo', dayKey: date,
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '', patientSex: p.sex || '', patientBirth: p.birthDate || '', patientBlood: p.bloodType || '',
      age: ageOf(p.birthDate), allergies: p.allergies || [], chronic: p.chronic || [], appointmentId: aRef.id, type, doctorId: d.id, doctor: d.name,
      reason, illness: findings, vitals: { ta: p.chronic?.includes('Hipertensión arterial') ? '138/86' : '118/76', fc: '74', fr: '16', temp: '36.5', sat: '98', peso: pk === 'santiago' ? '24' : '68', talla: '', glucemia: '' },
      exam: 'Extraoral: sin asimetrías ni adenopatías. ATM sin ruidos. Intraoral: mucosas hidratadas y rosadas.', systems: '',
      odontogram: p.odontogram || null, diagnoses: dx.map(([code, name, tooth], i) => ({ code, name, tooth: tooth || null, type: i === 0 ? 'Definitivo' : 'Presuntivo', note: '' })),
      procedures, anesthesia, plan: findings, rx, indications: ind, labs: [], imaging: [], xrayTeeth: [], labNote: '', referral: null, rest: null,
      nextVisit: null, docs: [], addenda: [], charges, total, cost: 0, discount: 0, stockApplied: true, by: 'demo'
    };
    if (method && charges.length) {
      const { sRef, sale } = addSale({ kind: 'consulta', date: end.toISOString(), items: charges.map((x) => ({ ...x, total: round2(x.price * x.qty) })), total, method, p, d, daysAgo, extra: { consultationId: cRef.id, consultationNumber: number, diagnosis: dx[0]?.[1] || '' } });
      Object.assign(c, { saleId: sRef.id, saleNumber: sale.number, paidAt: end.toISOString() });
    }
    // Abono al presupuesto en la misma visita
    if (pl && abono) {
      const t = planTotals(pl.plan);
      const amt = abono === 'all' ? round2(t.total - pl.plan.paid) : niceAmt(t.total * abono);
      if (amt > 0) {
        const items = [{ id: shortId(6), productId: null, name: `Abono a ${pl.plan.number} · ${pl.plan.title}`, qty: 1, price: amt, cost: 0, total: amt }];
        const { sale } = addSale({ kind: 'abono', date: end.toISOString(), items, total: amt, method: method || 'efectivo', p, d, daysAgo, extra: { planId: pl.ref.id, planNumber: pl.plan.number } });
        pl.plan.paid = round2(pl.plan.paid + amt); pl.plan.lastPaymentAt = end.toISOString();
        pl.plan.history.push({ at: end.toISOString(), note: `Abono ${sale.number}`, by: 'demo' });
      }
    }
    // Documentos verificables en las atenciones más recientes
    if (rx.length && daysAgo <= 6 && docsLeft > 0) {
      docsLeft--;
      const code = genCode(7);
      b.set(store.verifyRef(code), {
        tenantId: store.tenantId, code, kind: 'recipe', kindLabel: 'Récipe e indicaciones', issuedAt: end.toISOString(), number,
        clinic: { name: BIZ, phone: '601 555 0000', whatsapp: '300 000 0000', address: 'Centro Profesional Sonrisa, piso 3' },
        doctor: { name: d.name, specialty: d.specialty, cov: d.cov }, patient: { initials: initialsOf(p.name), id: p.idDoc ? p.idDoc.slice(0, 3) + '•••' + p.idDoc.slice(-2) : '' },
        summary: rx.map((r) => r.name).join(', ').slice(0, 240), valid: true, demo: true
      });
      c.docs.push({ kind: 'recipe', code, at: end.toISOString(), summary: rx.map((r) => r.name).join(', ').slice(0, 240) });
    }
    b.set(cRef, c);
    b.set(aRef, {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', date, time: hm(hour, minute), minutes: APPT_TYPES[type].minutes, type, reason,
      doctorId: d.id, doctor: d.name, notes: '', status: 'atendida', createdAt: at(daysAgo + 3, 10).toISOString(), updatedAt: end.toISOString(), by: 'demo', consultationId: cRef.id, reminded: true,
      arrivedAt: new Date(start.getTime() - 10 * 60000).toISOString(), startedAt: start.toISOString(), finishedAt: end.toISOString(),
      history: [{ at: at(daysAgo + 3, 10).toISOString(), note: 'Cita agendada', by: 'demo' }, { at: start.toISOString(), note: `En el sillón · ${number}`, by: 'demo' }, { at: end.toISOString(), note: `Atendida · ${number}`, by: 'demo' }]
    });
    const g = (ptAgg[p.id] ||= { visits: 0, spent: 0, last: null, lastId: null, dx: [], procs: [], odo: p.odontogram ? JSON.parse(JSON.stringify(p.odontogram)) : null });
    g.visits++; if (method) g.spent += total;
    procedures.forEach((x) => { const e = proc(x.code).effect; if (g.odo && x.tooth && e) applyEffect(g.odo, x.tooth, e, x.surfaces); });
    if (!g.last || end.toISOString() > g.last) { g.last = end.toISOString(); g.lastId = cRef.id; g.dx = dx.map((x) => x[1]).slice(0, 3); g.procs = procedures.slice(0, 4).map((x) => x.name + (x.tooth ? ` ${x.tooth}` : '')); }
  };
  const niceAmt = (v) => { const r = scaleUSD(1) >= 100 ? 1000 : scaleUSD(1) >= 10 ? 10 : 1; return Math.max(r, Math.round(v / r) * r); };
  [...history, ...today].forEach(addConsult);

  // Estado final de cada presupuesto (realizado/abonado)
  for (const { ref, plan } of Object.values(plans)) {
    const t = planTotals(plan);
    if (plan.status === 'en_curso' || plan.status === 'aprobado') { if (t.done === t.count) plan.status = 'terminado'; else if (t.done > 0) plan.status = 'en_curso'; }
    Object.assign(plan, { executed: t.executed });
    b.set(ref, plan);
  }

  // 4) Agenda de hoy en todos los estados, inasistencias pasadas y citas futuras
  const mk = (pk, daysFromToday, h, m, type, docId, reason, status, extra = {}) => {
    const p = P(pk); const d = D(docId);
    const date = dayKey(addDays(new Date(), daysFromToday));
    const created = at(Math.max(1, 3 - daysFromToday), 11).toISOString();
    const hist = [{ at: created, note: 'Cita agendada', by: 'demo' }];
    if (status === 'confirmada') hist.push({ at: nowISO(), note: 'Confirmada por el paciente', by: 'demo' });
    if (status === 'espera') hist.push({ at: extra.arrivedAt, note: 'Llegó al consultorio', by: 'demo' });
    if (status === 'no_asistio') hist.push({ at: nowISO(), note: 'No asistió', by: 'demo' });
    if (status === 'cancelada') hist.push({ at: nowISO(), note: 'Cancelada: Solicitud del paciente', by: 'demo' });
    b.set(store.newRef('appointments'), {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', date, time: hm(h, m), minutes: APPT_TYPES[type].minutes, type, reason,
      doctorId: d.id, doctor: d.name, notes: '', status, createdAt: created, updatedAt: nowISO(), by: 'demo', consultationId: null, reminded: status === 'confirmada', history: hist, ...extra
    });
  };
  const arrived = (min) => new Date(Date.now() - min * 60000).toISOString();
  const H = new Date().getHours();
  const base = Math.min(Math.max(H, 9), 15);
  mk('jose', 0, base, 0, 'cirugia', 'dmendez', 'Exodoncia 46 y raspado', 'espera', { arrivedAt: arrived(18) });
  mk('santiago', 0, base, 30, 'tratamiento', 'dsalazar', 'Corona de acero 74', 'espera', { arrivedAt: arrived(6) });
  mk('ana', 0, base + 1, 0, 'ortodoncia', 'drivas', 'Control de ortodoncia', 'confirmada');
  mk('valentina', 0, base + 1, 30, 'tratamiento', 'dsalazar', 'Blanqueamiento en consultorio', 'confirmada');
  mk('miguel', 0, Math.min(base + 2, 17), 0, 'urgencia', 'dsalazar', 'Endodoncia 37 (dolor)', 'programada');
  mk('daniela', 0, Math.min(base + 2, 17), 30, 'control', 'dmendez', 'Respuesta al presupuesto de cordales', 'programada');
  mk('isabel', 0, 8, 30, 'control', 'dsalazar', 'Control de encías', 'no_asistio');
  mk('rosa', 0, 9, 30, 'control', 'dsalazar', 'Entrega de rebase', 'cancelada', { cancelReason: 'Solicitud del paciente' });
  mk('carmen', -9, 9, 0, 'control', 'dsalazar', 'Control', 'no_asistio');
  mk('jorge', -16, 10, 0, 'tratamiento', 'dmendez', 'Endodoncia 46', 'no_asistio');
  mk('maria', 1, 9, 0, 'tratamiento', 'dsalazar', 'Resinas 16 y 11', 'programada');
  mk('luis', 1, 10, 0, 'control', 'dsalazar', 'Control post restauración', 'programada');
  mk('andres', 1, 11, 0, 'cirugia', 'dmendez', 'Cirugía de cordales', 'programada');
  mk('pedro', 1, 15, 0, 'control', 'dmendez', 'Control periodontal', 'confirmada');
  mk('maria', 7, 10, 30, 'tratamiento', 'dmendez', 'Preparación corona 26', 'programada');
  mk('ana', 30, 15, 0, 'ortodoncia', 'drivas', 'Control de ortodoncia', 'programada');

  // 5) Laboratorio dental
  const lab = (pk, work, teeth, status, cost, sentAgo, dueIn, extra = {}) => {
    const p = P(pk); const seq = store.nextSeq(b, 'lab');
    b.set(store.newRef('lab_orders'), {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', lab: 'Laboratorio Dental Precisión', labPhone: '601 555 7788', work, teeth, material: extra.material || '', shade: extra.shade || '',
      sentDate: sentAgo != null ? dayKey(addDays(new Date(), -sentAgo)) : '', tryDate: '', dueDate: dayKey(addDays(new Date(), dueIn)), cost: money(cost), notes: '', planId: plans[pk]?.ref.id || null,
      doctorId: 'dsalazar', doctor: D('dsalazar').name, number: fmtSeq('L', seq, 4), seq, status, paid: false, createdAt: at(sentAgo || 1, 12).toISOString(), updatedAt: nowISO(), by: 'demo', history: [{ at: at(sentAgo || 1, 12).toISOString(), note: 'Orden creada', by: 'demo' }]
    });
  };
  lab('rosa', 'Rebase de prótesis superior', [], 'recibido', 25, 7, 0, { material: 'Acrílico termocurado' });
  lab('carmen', 'Placa miorrelajante (bruxismo)', [], 'enviado', 35, 4, 3, { material: 'Acrílico duro' });
  lab('pedro', 'Corona sobre implante 25', [25], 'enviado', 120, 12, -2, { material: 'Zirconio', shade: 'A3' });
  lab('ana', 'Retenedores Essix superior e inferior', [], 'por_enviar', 30, null, 25);

  // 6) Periodontograma de ejemplo (paciente con periodontitis)
  const perioTeeth = {};
  [11, 12, 13, 14, 21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 44, 36, 46, 37, 47].forEach((n, i) => {
    const deep = [31, 44, 36, 46].includes(n);
    perioTeeth[n] = { pd: deep ? [5, 4, 6, 5, 4, 5] : [3, 2, 3, 2, 2, 3], bop: deep ? [1, 0, 1, 1, 0, 1] : [0, 0, i % 3 === 0 ? 1 : 0, 0, 0, 0], pl: [i % 2, 0], mob: [31, 44].includes(n) ? 1 : 0, furca: [36, 46].includes(n) ? 1 : 0, rec: deep ? 2 : 0, missing: false };
  });
  b.set(store.newRef('perio'), { patientId: 'demo_pedro', patientName: P('pedro').name, teeth: perioTeeth, notes: 'Periodontitis estadio II localizada. Interconsulta con cardiología por warfarina antes del raspado.', stats: {}, doctor: D('dmendez').name, date: at(16, 11).toISOString(), updatedAt: at(16, 11).toISOString(), by: 'demo' });

  // 7) Caja abierta de hoy con un gasto de ejemplo
  const exp = money(3);
  b.set(store.newRef('cash_movements'), { shiftId: shiftRef.id, date: at(0, 8, 10).toISOString(), dayKey: todayKey(), type: 'expense', direction: 'out', currency: 'USD', amount: exp, rate: 1, flow: { inUSD: 0, inBs: 0, outUSD: exp, outBs: 0 }, concept: 'Botellón de agua para la sala de espera', category: 'Mantenimiento y limpieza', by: 'demo' });
  shift.inUSD = round2(shift.inUSD); shift.outUSD = exp; shift.expensesUSD = exp;
  b.set(shiftRef, shift);

  // 8) Pacientes: visitas, última atención, odontograma actualizado y recall
  for (const [id, g] of Object.entries(ptAgg)) {
    b.set(store.ref('patients', id), { visits: g.visits, totalSpent: round2(g.spent), lastVisitAt: g.last, lastConsultId: g.lastId, lastDiagnoses: g.dx, lastProcedures: g.procs, ...(g.odo ? { odontogram: { ...g.odo, updatedAt: g.last } } : {}), updatedAt: nowISO() }, { merge: true });
  }
  b.set(store.ref('patients', 'demo_valentina'), { recallAt: dayKey(addDays(new Date(), -3)) }, { merge: true });
  b.set(store.ref('patients', 'demo_luis'), { recallAt: dayKey(addDays(new Date(), 2)) }, { merge: true });
  b.set(store.ref('patients', 'demo_isabel'), { recallAt: dayKey(addDays(new Date(), 5)) }, { merge: true });
  await store.commit(b);
}

/** Borra todos los datos de una sede (y sus documentos públicos de verificación). */
export async function purgeTenant(tenantId, onlyDemo = true) {
  try {
    const codes = [];
    for (const c of ['consultations', 'plans']) {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      snap.docs.forEach((d) => (d.data().docs || []).forEach((x) => x.code && codes.push(x.code)));
    }
    for (let i = 0; i < codes.length; i += 80) {
      const b = writeBatch(db);
      codes.slice(i, i + 80).forEach((c) => b.delete(doc(db, 'verify', c)));
      await b.commit().catch((e) => console.warn('[purge] verificación', e?.code || e));
    }
  } catch (e) { console.warn('[purge] verificación', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 80) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId) {
  await purgeTenant(tenantId, true);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
