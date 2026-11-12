// Sano Dental — Capa de datos multisede (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { addDays, startOfDay, sha256, toast, todayKey, dayKey, applyLocale, setFx, scaleUSD } from './utils.js';
import { MEDICAL_TAGS, DEFAULT_PROCEDURES } from './clinical.js';

// ---------- Citas ----------
export const APPT_STATUS = {
  programada: { label: 'Programada', short: 'Programada', tone: 'info', icon: 'calendar' },
  confirmada: { label: 'Confirmada', short: 'Confirmada', tone: 'brand', icon: 'check' },
  espera: { label: 'En sala de espera', short: 'En espera', tone: 'warning', icon: 'clock' },
  consulta: { label: 'En el sillón', short: 'En el sillón', tone: 'violet', icon: 'tooth' },
  atendida: { label: 'Atendida', short: 'Atendida', tone: 'success', icon: 'checkCircle' },
  no_asistio: { label: 'No asistió', short: 'No asistió', tone: 'danger', icon: 'x' },
  cancelada: { label: 'Cancelada', short: 'Cancelada', tone: 'neutral', icon: 'x' }
};
export const ACTIVE_APPT = ['programada', 'confirmada', 'espera', 'consulta'];
export const apptBadge = (s) => {
  const st = APPT_STATUS[s] || { label: s, tone: 'neutral' };
  return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`;
};

export const APPT_TYPES = {
  primera: { label: 'Evaluación (primera vez)', service: 'Consulta de evaluación y diagnóstico', minutes: 30, color: '#0284c7' },
  control: { label: 'Control', service: 'Consulta de control', minutes: 20, color: '#2563eb' },
  tratamiento: { label: 'Sesión de tratamiento', service: '', minutes: 60, color: '#7c3aed' },
  limpieza: { label: 'Limpieza / profilaxis', service: 'Profilaxis (limpieza dental)', minutes: 45, color: '#0d9488' },
  urgencia: { label: 'Urgencia (dolor)', service: 'Consulta de urgencia', minutes: 30, color: '#dc2626' },
  cirugia: { label: 'Cirugía', service: '', minutes: 60, color: '#b45309' },
  ortodoncia: { label: 'Control de ortodoncia', service: 'Control de ortodoncia mensual', minutes: 20, color: '#db2777' }
};

export const SEX = { F: 'Femenino', M: 'Masculino' };
export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
export const CHRONIC_TAGS = MEDICAL_TAGS;
export const ALLERGY_TAGS = ['Penicilina', 'Anestésicos locales (lidocaína)', 'AINES', 'Aspirina', 'Sulfas', 'Cefalosporinas', 'Clindamicina', 'Látex', 'Clorhexidina', 'Yodo', 'Metales (níquel)', 'Dipirona'];
export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const PRODUCT_CATEGORIES = ['Anestésicos', 'Resinas y adhesivos', 'Endodoncia', 'Cirugía y suturas', 'Impresión y prótesis', 'Profilaxis y prevención', 'Ortodoncia', 'Material descartable', 'Bioseguridad', 'Medicamentos', 'Otros'];
export const DEFAULT_SERVICES = DEFAULT_PROCEDURES.map((p) => ({ ...p }));
export const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30, sat: false, satStart: '08:00', satEnd: '12:00' };
export const DEFAULT_RX_NOTE = 'Récipe válido por 30 días. No se automedique. Ante cualquier reacción adversa suspenda el tratamiento y llame al consultorio.';

// ---------- Presupuestos (planes de tratamiento) ----------
export const PLAN_STATUS = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  presentado: { label: 'Presentado', tone: 'info' },
  aprobado: { label: 'Aprobado', tone: 'brand' },
  en_curso: { label: 'En tratamiento', tone: 'violet' },
  terminado: { label: 'Terminado', tone: 'success' },
  rechazado: { label: 'No aceptado', tone: 'danger' },
  anulado: { label: 'Anulado', tone: 'neutral' }
};
export const OPEN_PLAN = ['borrador', 'presentado', 'aprobado', 'en_curso'];
export const planBadge = (s) => { const st = PLAN_STATUS[s] || { label: s, tone: 'neutral' }; return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`; };

// ---------- Trabajos de laboratorio dental ----------
export const LAB_STATUS = {
  por_enviar: { label: 'Por enviar', tone: 'neutral' },
  enviado: { label: 'En el laboratorio', tone: 'info' },
  prueba: { label: 'En prueba', tone: 'warning' },
  recibido: { label: 'Recibido', tone: 'brand' },
  instalado: { label: 'Instalado', tone: 'success' },
  repeticion: { label: 'Repetición', tone: 'danger' }
};
export const OPEN_LAB = ['por_enviar', 'enviado', 'prueba', 'recibido', 'repeticion'];
export const LAB_WORKS = ['Corona metal-porcelana', 'Corona de zirconio', 'Corona de disilicato (e.max)', 'Corona sobre implante', 'Puente fijo', 'Perno muñón colado', 'Incrustación', 'Carilla de porcelana', 'Prótesis total', 'Prótesis parcial removible acrílica', 'Prótesis parcial metálica', 'Placa miorrelajante', 'Retenedor', 'Aparato de ortodoncia', 'Provisionales', 'Modelos de estudio', 'Guía quirúrgica', 'Férulas de blanqueamiento'];
export const VITA_SHADES = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'BL1', 'BL2', 'BL3', 'BL4'];

const DEFAULT_SETTINGS = {
  fx: { enabled: false, sym: 'Bs', name: 'Bolívares', rate: 0, updatedAt: '' },
  businessName: '',
  rif: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  instagram: '',
  receiptFooter: '¡Gracias por su confianza! Cuide su sonrisa.',
  receiptFormat: '80mm',
  rxFormat: 'media',
  rxNote: DEFAULT_RX_NOTE,
  docTitle: 'RECIBO',
  country: '',
  currency: '',
  iva: 0,
  services: DEFAULT_SERVICES,
  categories: PRODUCT_CATEGORIES,
  doctors: [],
  schedule: DEFAULT_SCHEDULE,
  favMeds: [],
  planValidDays: 30,
  planNote: 'Los precios pueden variar si durante el tratamiento se encuentran condiciones no visibles en el examen inicial. El tratamiento se inicia con el abono acordado.',
  recallMonths: 6
};

class Store {
  constructor() {
    this.tenantId = null;
    this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.security = {};
    this.counters = {};
    this.announcement = null;
    this.patients = [];
    this.appointments = [];
    this.openConsults = [];
    this.pending = [];
    this.products = [];
    this.openShift = null;
    this.recentSales = [];
    this.plans = [];
    this.labOrders = [];
    this.ready = false;
    this._unsubs = [];
    this._listeners = {};
    this._loaded = new Set();
  }

  // ---------- Eventos ----------
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  // ---------- Referencias ----------
  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  verifyRef(code) { return doc(db, 'verify', String(code)); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /**
   * Confirma un lote. La caché local aplica el cambio al instante (también sin internet);
   * se espera la confirmación del servidor como máximo unos segundos para no bloquear la consulta.
   */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la sede esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }

  async save(name, id, data, merge = true) {
    const b = this.batch();
    b.set(this.ref(name, id), data, { merge });
    await this.commit(b);
  }
  async remove(name, id) {
    const b = this.batch();
    b.delete(this.ref(name, id));
    await this.commit(b);
  }

  // ---------- Ciclo de vida ----------
  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'patients', 'appointments', 'consults', 'pending', 'products', 'shift', 'sales', 'plans', 'labs'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      applyLocale(this.settings.country || 'VE', this.settings.currency);
      this.settings.fx = { ...DEFAULT_SETTINGS.fx, ...(this.settings.fx || {}) };
      setFx(this.settings.fx);
      // Aranceles guardados sin código o categoría: se completan con el arancel base
      if (Array.isArray(this.settings.services)) this.settings.services = this.settings.services.map((x) => ({ ...(DEFAULT_PROCEDURES.find((d) => d.code === x.code || d.name === x.name) || { cat: 'Otros', unit: 'diente', effect: null }), ...x }));
      for (const k of ['categories', 'services']) {
        if (!Array.isArray(this.settings[k]) || !this.settings[k].length) this.settings[k] = DEFAULT_SETTINGS[k];
      }
      if (!Array.isArray(this.settings.doctors)) this.settings.doctors = [];
      if (!Array.isArray(this.settings.favMeds)) this.settings.favMeds = [];
      this.settings.schedule = { ...DEFAULT_SCHEDULE, ...(this.settings.schedule || {}) };
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('patients'), 'patients', (s) => { this.patients = rows(s).sort(byName); this._ptMap = null; });
    // Agenda: desde hace 14 días en adelante (el historial completo se consulta aparte)
    const fromDay = dayKey(addDays(new Date(), -14));
    listen(query(this.col('appointments'), where('date', '>=', fromDay)), 'appointments', (s) => {
      this.appointments = rows(s).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    });
    listen(query(this.col('consultations'), where('status', '==', 'abierta')), 'consults', (s) => {
      this.openConsults = rows(s).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    });
    listen(query(this.col('consultations'), where('billing', '==', 'pendiente')), 'pending', (s) => {
      this.pending = rows(s).filter((c) => c.status === 'cerrada').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
    });
    listen(this.col('products'), 'products', (s) => { this.products = rows(s).sort(byName); this._pMap = null; });
    listen(query(this.col('cash_shifts'), where('status', '==', 'open')), 'shift', (s) => {
      this.openShift = rows(s).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))[0] || null;
    });
    const since = startOfDay(addDays(new Date(), -7)).toISOString();
    listen(query(this.col('sales'), where('date', '>=', since)), 'sales', (s) => {
      this.recentSales = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });

    listen(query(this.col('plans'), where('status', 'in', OPEN_PLAN)), 'plans', (s) => {
      this.plans = rows(s).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
    listen(query(this.col('lab_orders'), where('status', 'in', OPEN_LAB)), 'labs', (s) => {
      this.labOrders = rows(s).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    });

    // Nunca bloquear más de 8 s (p. ej. sin internet y sin caché)
    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
    this.ready = false;
    this.tenant = null; this.patients = []; this.appointments = []; this.openConsults = []; this.pending = []; this.products = [];
    this.openShift = null; this.recentSales = []; this.plans = []; this.labOrders = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this._pMap = null; this._ptMap = null;
  }

  // ---------- Ajustes ----------
  /** Una sola moneda de trabajo (la del país): la tasa siempre es 1 */
  get rate() { return 1; }
  get country() { return this.settings.country || ''; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi consultorio odontológico'; }
  /** Procedimiento del arancel por código o nombre */
  proc(codeOrName) { return this.settings.services.find((s) => s.code && s.code === codeOrName) || this.settings.services.find((s) => s.name === codeOrName) || null; }
  plan(id) { return this.plans.find((p) => p.id === id); }
  patientPlans(patientId) { return this.plans.filter((p) => p.patientId === patientId); }
  get overdueLabs() { const t = todayKey(); return this.labOrders.filter((l) => l.dueDate && l.dueDate < t && ['por_enviar', 'enviado', 'prueba', 'repeticion'].includes(l.status)); }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    if (patch.fx) setFx(this.settings.fx);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  /** País de trabajo: define moneda, formas de pago, prefijo de WhatsApp y nombres de documentos */
  async setCountry(code, currency = null) {
    const prevCur = this.settings.currency || 'USD';
    const first = !this.settings.country;
    const l = applyLocale(code, currency);
    const patch = { country: code, currency: l.cur, countrySetAt: new Date().toISOString() };
    // Primera vez: el arancel de ejemplo (en USD) se adapta a la moneda del país
    if (first && prevCur !== l.cur) {
      const def = new Map(DEFAULT_SERVICES.map((x) => [x.code || x.name, x.price]));
      patch.services = (this.settings.services || []).map((x) => (def.get(x.code || x.name) === x.price ? { ...x, price: scaleUSD(x.price, l.cur, l.dec) } : x));
    }
    await this.saveSettings(patch);
    this.emit('rate', 1);
  }

  /** Correlativo (historias "hc", consultas "con", facturas "inv"…). Se reserva en el mismo lote que el documento. */
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN de administrador ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) {
      const s = await getDoc(this.ref('config', 'security')).catch(() => null);
      if (s?.exists()) this.security = s.data();
    }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Búsquedas ----------
  product(id) {
    if (!this._pMap) this._pMap = new Map(this.products.map((p) => [p.id, p]));
    return this._pMap.get(id);
  }
  patient(id) {
    if (!this._ptMap) this._ptMap = new Map(this.patients.map((p) => [p.id, p]));
    return this._ptMap.get(id);
  }
  appointment(id) { return this.appointments.find((a) => a.id === id); }
  consult(id) { return this.openConsults.find((c) => c.id === id) || this.pending.find((c) => c.id === id); }
  doctor(id) { return this.settings.doctors.find((d) => d.id === id); }
  get activeDoctors() { return this.settings.doctors.filter((d) => d.active !== false); }
  get mainDoctor() { return this.activeDoctors[0] || null; }
  get activePatients() { return this.patients.filter((p) => p.active !== false); }

  // ---------- Agenda ----------
  apptsOn(day) { return this.appointments.filter((a) => a.date === day); }
  get todayAppts() { return this.apptsOn(todayKey()); }
  get waiting() { return this.todayAppts.filter((a) => a.status === 'espera').sort((a, b) => (a.arrivedAt || '').localeCompare(b.arrivedAt || '')); }

  // ---------- Alertas de inventario ----------
  get lowProducts() {
    return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || 0));
  }
  get outProducts() { return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= 0); }
  /** Insumos vencidos o que vencen en los próximos 60 días (con existencia) */
  get expiringProducts() {
    const lim = dayKey(addDays(new Date(), 60));
    return this.products.filter((p) => p.active !== false && p.expiresAt && p.expiresAt <= lim && (Number(p.stock) || 0) > 0)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }

  // ---------- Consultas a la base ----------
  async listBetween(name, field, fromISO, toISO) {
    const s = await getDocs(query(this.col(name), where(field, '>=', fromISO), where(field, '<=', toISO)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async salesBetween(fromISO, toISO) { return this.listBetween('sales', 'date', fromISO, toISO); }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async getDocById(name, id) {
    const s = await getDoc(this.ref(name, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }
  async getConsult(id) { return this.consult(id) || this.getDocById('consultations', id); }
  async getPatient(id) { return this.patient(id) || this.getDocById('patients', id); }
  async patientPlansAll(patientId) {
    return (await this.listEq('plans', 'patientId', patientId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  async getPlan(id) { return this.plan(id) || this.getDocById('plans', id); }
  async patientConsults(patientId) {
    return (await this.listEq('consultations', 'patientId', patientId)).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }
  async closedShifts(max = 30) {
    const s = await getDocs(query(this.col('cash_shifts'), where('status', '==', 'closed')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, max);
  }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'sales'), where('date', '>=', fromISO)));
  return s.docs.map((d) => d.data());
}
export async function tenantApptsOn(tenantId, day) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'appointments'), where('date', '==', day)));
  return s.docs.map((d) => d.data());
}
export async function getTenant(id) {
  const s = await getDoc(doc(db, 'tenants', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) {
  const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() {
  const s = await getDoc(doc(db, 'system', 'announcement'));
  return s.exists() ? s.data() : null;
}
/** Verificación pública de un documento médico (página /verificar/CODIGO) */
export async function getVerify(code) {
  const s = await getDoc(doc(db, 'verify', String(code).toUpperCase()));
  return s.exists() ? s.data() : null;
}
export { DEFAULT_SETTINGS };
