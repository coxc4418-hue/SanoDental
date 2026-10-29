// Sano Dental — Prueba de extremo a extremo contra los emuladores
// Requisitos: firebase emulators:start --only auth,firestore,hosting  y  node provision.mjs 3 --emu
// Uso: node e2e.mjs [url=http://127.0.0.1:5088] [carpeta-capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5088') + '/?emu=1';
const SHOTS = process.argv[3] || path.join(here, 'shots');
mkdirSync(SHOTS, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));

const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'OK ' : 'FALLA', name, extra]); console.log(cond ? '  ✔' : '  ✘', name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--window-size=1400,900'] });
const errors = [];

async function newPage(w = 1400, h = 900) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|dolarapi|ERR_|Failed to load resource|net::|CORS/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.dismiss());
  // Evita que el diálogo de impresión bloquee la prueba
  await page.evaluateOnNewDocument(() => { window.print = () => {}; window.open = () => null; HTMLIFrameElement.prototype.focus = function () {}; });
  return { ctx, page };
}
const clickText = async (page, sel, text, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate((sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\s+/g, ' ').includes(text));
      if (el) { el.click(); return true; } return false;
    }, sel, text);
    if (ok) return true;
    await sleep(150);
  }
  throw new Error(`No encontré ${sel} con texto "${text}"`);
};
const waitText = (page, text, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
const store = (page, fn, arg) => page.evaluate(async (fnSrc, arg) => { const { store } = await import('/js/store.js'); return (0, eval)(fnSrc)(store, arg); }, fn.toString(), arg);
const fill = async (page, sel, value) => { await page.$eval(sel, (e) => { e.value = ''; }); await page.type(sel, String(value)); };
const nav = async (page, id) => { await page.evaluate((id) => { const b = document.querySelector(`.sb-nav [data-nav="${id}"]`); b.click(); }, id); await sleep(700); };

const ORIGIN = process.argv[2] || 'http://127.0.0.1:5088';
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
const top = '.modal-backdrop:last-child';
const closeModals = (page) => page.evaluate(async () => { const u = await import('/js/utils.js'); u.closeAllModals(); });
const typePin = async (page, pin) => {
  await page.waitForSelector(`${top} [data-pin]`, { timeout: 8000 });
  await page.type(`${top} [data-pin]`, pin);
  await page.click(`${top} [data-ok]`);
  await sleep(700);
};
const login = async (page, user, pass) => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', user);
  await page.type('#lg-pass', pass);
  await page.click('#lg-btn');
};
const consults = (page) => store(page, async (s) => (await s.listBetween('consultations', 'startedAt', new Date(Date.now() - 120 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString())).map((c) => ({ id: c.id, number: c.number, status: c.status, billing: c.billing, docs: c.docs || [], total: c.total, patientId: c.patientId, saleId: c.saleId })));
const readPublic = (page, code) => page.evaluate(async (c) => { const f = await import('/js/firebase.js'); try { const d = await f.getDoc(f.doc(f.db, 'verify', c)); return d.exists() ? d.data() : null; } catch (e) { return e.code; } }, code);
const payWith = async (page, method) => {
  await page.waitForSelector(`${top} [data-m="${method}"]`, { timeout: 10000 });
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:last-child [data-rm]').forEach((l) => l.click()); });
  await sleep(150);
  await page.click(`${top} [data-m="${method}"]`);
  await sleep(250);
  await page.click(`${top} [data-ok]`);
};
let demoUid = null; let demoCode = null;

try {
  // ==================================================================
  console.log('\n1) Pantalla de inicio de sesión');
  let { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  ok('Login visible', true);
  ok('Botón de demo', !!(await page.$('#lg-demo')));
  ok('Botón “Verificar un documento”', !!(await page.$('#lg-track')));
  const wa = await page.$eval('#lg-wa', (a) => a.href);
  ok('WhatsApp de contratación 584221906045', wa.includes('wa.me/584221906045'), wa.slice(0, 40));
  ok('Logo del sistema', await page.evaluate(() => [...document.images].some((i) => i.src.includes('/assets/logo.svg') && i.complete && i.naturalWidth > 0)));
  await shot(page, '01-login.png');

  // ==================================================================
  console.log('\n2) Demo de 30 minutos (pide el país y adapta los precios)');
  await page.click('#lg-demo');
  await page.waitForSelector('.country-grid [data-c="CO"]', { timeout: 60000 });
  ok('La demo pide el país antes de empezar', true);
  await shot(page, '02-pais.png');
  await page.type(`${top} [data-q]`, 'colom'); await sleep(300);
  ok('Buscador de países', (await page.$$('.country-grid [data-c]')).length === 1);
  await page.click('.country-grid [data-c="CO"]'); await sleep(300);
  await page.click(`${top} [data-ok]`);
  await page.waitForSelector('.sb-nav', { timeout: 60000 });
  await waitText(page, 'Modo demo');
  await page.waitForSelector('.tour-tip', { timeout: 30000 });
  ok('Recorrido guiado se abre solo en la demo', true);
  await shot(page, '03-tour.png');
  await page.click('.tour-tip [data-t="stop"]');
  await sleep(3500);
  demoUid = await page.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  const d = await store(page, (s) => ({ pt: s.patients.length, docs: s.settings.doctors.length, today: s.todayAppts.length, wait: s.waiting.length, shift: !!s.openShift, pend: s.pending.length, prod: s.products.length, exp: s.expiringProducts.length, low: s.lowProducts.length, sales: s.recentSales.length, st: [...new Set(s.todayAppts.map((a) => a.status))], plans: s.plans.length, labs: s.labOrders.length, country: s.settings.country, cur: s.settings.currency, d01: s.proc('D01')?.price, odo: s.patients.filter((p) => Object.keys(p.odontogram?.teeth || {}).length).length }));
  ok('País Colombia y moneda COP guardados', d.country === 'CO' && d.cur === 'COP');
  ok('Arancel adaptado a pesos colombianos', d.d01 >= 50000, `Evaluación = ${d.d01}`);
  ok('Pacientes de ejemplo con odontograma', d.pt >= 14 && d.odo >= 12, `${d.pt} pacientes · ${d.odo} con odontograma`);
  ok('Tres odontólogos', d.docs === 3);
  ok('Agenda de hoy en varios estados', d.today >= 8 && d.st.length >= 4, `${d.today} citas · ${d.st.join(', ')}`);
  ok('Sala de espera con pacientes', d.wait >= 2, `${d.wait}`);
  ok('Caja abierta y atención por cobrar', d.shift && d.pend >= 1);
  ok('Presupuestos activos de ejemplo', d.plans >= 5, `${d.plans}`);
  ok('Trabajos de laboratorio abiertos', d.labs >= 3, `${d.labs}`);
  ok('Insumos con alertas (bajos y por vencer)', d.prod >= 14 && d.exp >= 1 && d.low >= 1, `${d.prod} insumos · ${d.low} bajos · ${d.exp} por vencer`);
  ok('Cobros y abonos de ejemplo', d.sales >= 4, `${d.sales} cobros`);
  ok('Montos en pesos en pantalla', await page.evaluate(() => /\$ \d{1,3}(\.\d{3})+/.test(document.body.innerText)));
  await page.waitForSelector('[data-attend]');
  await shot(page, '04-inicio-demo.png');
  const dc = await consults(page);
  ok('Atenciones cerradas de ejemplo', dc.filter((c) => c.status === 'cerrada').length >= 12, `${dc.length}`);
  demoCode = dc.flatMap((c) => c.docs).find((x) => x.code)?.code;
  ok('Documentos con código de verificación', !!demoCode, demoCode);
  await nav(page, 'agenda');
  await page.waitForSelector('#ag-body [data-detail]');
  ok('Agenda del día con citas', (await page.$$('#ag-body [data-detail]')).length >= 6);
  await shot(page, '05-agenda.png');
  await nav(page, 'presupuestos'); await sleep(1200);
  ok('Vista de presupuestos', await page.evaluate(() => document.querySelectorAll('[data-p]').length >= 4));
  await shot(page, '06-presupuestos.png');
  await page.click('[data-p]'); await sleep(1500);
  ok('Detalle del presupuesto con fases y saldo', await page.evaluate(() => /saldo/i.test(document.querySelector('.modal-backdrop:last-child')?.innerText || '')));
  await shot(page, '07-presupuesto-detalle.png');
  await closeModals(page); await sleep(400);
  await nav(page, 'laboratorio'); await sleep(1000);
  ok('Vista de laboratorio', await page.evaluate(() => document.body.innerText.includes('Laboratorio Dental Precisión')));
  await shot(page, '08-laboratorio.png');
  // Atender desde la sala de espera
  await nav(page, 'inicio');
  await page.waitForSelector('[data-attend]');
  await page.click('[data-attend]');
  await page.waitForSelector('.consult-modal .rp-head', { timeout: 15000 });
  ok('Atención abierta desde la sala de espera', true);
  await page.click('.consult-modal [data-tab="odo"]'); await sleep(600);
  ok('Odontograma con 32 dientes', (await page.$$('.consult-modal [data-odo-ed] svg.tooth')).length >= 32);
  await shot(page, '09-odontograma-demo.png');
  await page.click('.consult-modal [data-tab="proc"]'); await sleep(600);
  ok('Tratamientos del presupuesto para marcar', (await page.$$('.consult-modal [data-pi]')).length >= 1);
  await shot(page, '10-tratamientos-demo.png');
  await closeModals(page); await sleep(500);
  // Ficha del paciente
  await nav(page, 'pacientes');
  await page.waitForSelector('#pt-list [data-open]');
  ok('Lista de pacientes', (await page.$$('#pt-list [data-open]')).length >= 10);
  await page.click('#pt-list [data-open]');
  await page.waitForSelector('.modal [data-tab="odo"]', { timeout: 10000 });
  await page.click('.modal [data-tab="odo"]'); await sleep(700);
  ok('Ficha con odontograma editable', (await page.$$('.modal svg.tooth')).length >= 20);
  await shot(page, '11-ficha-odontograma.png');
  await page.click('.modal [data-tab="perio"]'); await sleep(700);
  await shot(page, '12-ficha-perio.png');
  await closeModals(page); await sleep(400);
  // Periodontograma de ejemplo
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); const { openPerio, patientPerios } = await import('/js/perio.js'); const p = store.patient('demo_pedro'); const list = await patientPerios(p.id); openPerio(p, list[0]); });
  await page.waitForSelector('.perio-modal .perio-table', { timeout: 10000 });
  ok('Periodontograma con índices', await page.evaluate(() => document.querySelector('.perio-modal').innerText.includes('Sangrado')));
  await shot(page, '13-periodontograma.png');
  await closeModals(page); await sleep(400);
  await nav(page, 'consultas'); await sleep(800);
  await shot(page, '14-atenciones.png');
  // PIN de la demo
  await nav(page, 'reportes');
  await page.waitForSelector(`${top} [data-pin]`);
  ok('El PIN de la demo se muestra (1234)', await page.evaluate(() => document.querySelector('.modal-backdrop:last-child').innerText.includes('1234')));
  await page.type(`${top} [data-pin]`, '9999'); await page.click(`${top} [data-ok]`); await sleep(800);
  ok('PIN incorrecto rechazado', await page.evaluate(() => (document.querySelector('.modal-backdrop:last-child [data-err]')?.textContent || '').length > 3));
  await page.$eval(`${top} [data-pin]`, (e) => { e.value = ''; });
  await page.type(`${top} [data-pin]`, '1234'); await page.click(`${top} [data-ok]`);
  await sleep(3000);
  ok('Reportes con PIN 1234', await page.evaluate(() => !document.querySelector('.modal [data-pin]') && document.querySelector('.view-title')?.textContent.includes('Reportes')));
  ok('Reporte de tratamientos y producción', await page.evaluate(() => document.body.innerText.includes('Tratamientos más realizados') && document.body.innerText.includes('Producción por odontólogo')));
  await shot(page, '15-reportes-demo.png');
  // Página pública de verificación
  const pub = await newPage(390, 844);
  await pub.page.goto(`${ORIGIN}/verificar/${demoCode}?emu=1`, { waitUntil: 'domcontentloaded' });
  await pub.page.waitForSelector('.vf-hero', { timeout: 20000 });
  ok('Verificación pública del documento (sin sesión)', await pub.page.evaluate(() => document.body.innerText.includes('Documento auténtico')), demoCode);
  await shot(pub.page, '16-verificar.png');
  await pub.page.goto(`${ORIGIN}/verificar/ZZZZZZZ?emu=1`, { waitUntil: 'domcontentloaded' });
  await waitText(pub.page, 'no es auténtico', 20000);
  ok('Código falso: documento no auténtico', true);
  await pub.ctx.close();
  // Terminar la demo
  await page.click('#demo-end');
  await page.waitForSelector(`${top} [data-yes]`);
  await page.click(`${top} [data-yes]`);
  await page.waitForSelector('#login-form', { timeout: 40000 });
  ok('Demo terminada vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('\n3) Sede: país, odontólogo, caja, paciente, cita, odontograma, presupuesto, tratamiento y cobro');
  ({ ctx, page } = await newPage());
  await login(page, 'sede01', acc.sede01.password);
  await page.waitForSelector('.country-grid [data-c="MX"]', { timeout: 30000 });
  ok('Primera entrada: pide el país (obligatorio)', !(await page.$(`${top} [data-close]`)));
  await page.click('.country-grid [data-c="MX"]'); await sleep(200);
  await page.click(`${top} [data-ok]`);
  await page.waitForSelector('.sb-nav', { timeout: 30000 });
  await sleep(1500);
  await closeModals(page);
  const loc1 = await store(page, (s) => ({ c: s.settings.country, cur: s.settings.currency, d01: s.proc('D01')?.price, pv01: s.proc('PV01')?.price }));
  loc1.d01 = Number(loc1.d01); loc1.pv01 = Number(loc1.pv01);
  ok('México → pesos mexicanos y arancel adaptado', loc1.c === 'MX' && loc1.cur === 'MXN' && loc1.d01 >= 300, `D01 ${loc1.d01} · PV01 ${loc1.pv01}`);
  ok('Indicador de país en el menú', await page.evaluate(() => document.querySelector('.sb-nav')?.closest('aside, .sidebar, body').innerText.includes('México')));
  // Al volver a entrar ya no pregunta
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sb-nav', { timeout: 30000 }); await sleep(1500);
  ok('Al volver a entrar no pregunta el país', !(await page.$('.country-grid')));
  await closeModals(page);
  await store(page, (s) => s.saveSettings({
    doctors: [{ id: 'dprueba', name: 'Laura Prueba', sex: 'F', specialty: 'Odontología general', cov: '123456', active: true }],
    schedule: { ...s.settings.schedule, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:30', breakStart: '', breakEnd: '', sat: true, satStart: '00:00', satEnd: '23:30' }
  }));
  await store(page, async (s) => {
    const b = s.batch(); const now = new Date().toISOString();
    b.set(s.newRef('products'), { name: 'Cepillo Prueba suave', category: 'Profilaxis y prevención', cost: 20, price: 60, stock: 10, minStock: 2, sellable: true, trackStock: true, active: true, sold: 0, lot: 'L-1', expiresAt: '2030-01-01', createdAt: now, updatedAt: now });
    await s.commit(b);
  });
  await sleep(800);
  ok('Odontólogo configurado', await store(page, (s) => s.activeDoctors.length === 1));
  // Abrir caja (UI)
  await nav(page, 'caja');
  await page.waitForSelector('#k-open');
  await page.type('#k-open [name="usd"]', '500');
  await page.click('#k-open button[type="submit"], #k-open .btn-primary');
  await sleep(1500);
  ok('Caja abierta en pesos', !!(await store(page, (s) => s.openShift?.id && s.openShift.openingUSD === 500)));
  // Paciente nuevo (UI)
  await nav(page, 'pacientes');
  await page.waitForSelector('#pt-new');
  await page.click('#pt-new');
  await page.waitForSelector(`${top} [name="name"]`);
  await page.type(`${top} [name="name"]`, 'María Prueba González');
  await page.type(`${top} [name="idNum"]`, 'GOGM880412');
  await page.$eval(`${top} [name="birthDate"]`, (e) => { e.value = '1988-04-12'; e.dispatchEvent(new Event('input')); });
  await page.click(`${top} [data-s="F"]`);
  await page.type(`${top} [name="phone"]`, '55 1234 5678');
  await page.click(`${top} [data-t="ant"]`); await sleep(200);
  await page.click(`${top} [data-allergy] [data-chip="Penicilina"]`);
  await page.click(`${top} [data-chronic] [data-chip="Hipertensión arterial"]`);
  await page.click(`${top} [data-t="dent"]`); await sleep(200);
  await page.select(`${top} [name="d_sangrado"]`, 'Al cepillarse');
  await shot(page, '17-paciente-nuevo.png');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Paciente registrado', 10000);
  await sleep(1200);
  const pt = await store(page, (s) => s.patients.find((p) => p.name === 'María Prueba González'));
  ok('Paciente con alergia, condición médica e historia dental', !!pt?.number && pt.allergies.includes('Penicilina') && pt.chronic.includes('Hipertensión arterial') && pt.dental?.sangrado === 'Al cepillarse' && pt.idDoc === 'GOGM880412', `${pt?.number} · ${pt?.idDoc}`);
  await closeModals(page); await sleep(400);
  // Cita (UI)
  await nav(page, 'agenda');
  await page.waitForSelector('#ag-new');
  await page.click('#ag-new');
  await page.waitForSelector(`${top} [data-search]`);
  await page.click(`${top} [data-search]`);
  await page.waitForSelector(`${top} [data-q]`);
  await page.type(`${top} [data-q]`, 'maría prueba');
  await page.waitForSelector(`${top} [data-p="${pt.id}"]`);
  await page.click(`${top} [data-p="${pt.id}"]`);
  await sleep(500);
  const slot = await page.evaluate(() => { const s = document.querySelector('.modal-backdrop:last-child [name="slot"]'); const o = [...s.options].find((x) => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } return o?.value; });
  ok('Horarios libres sugeridos', !!slot, slot);
  await page.type(`${top} [name="reason"]`, 'Dolor en muela superior derecha');
  await page.$eval(`${top} [name="wa"]`, (e) => { e.checked = false; });
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Cita agendada', 10000);
  await sleep(900);
  let appt = await store(page, (s, id) => s.appointments.find((a) => a.patientId === id), pt.id);
  ok('Cita agendada', appt?.status === 'programada' && appt.time === slot && appt.doctorId === 'dprueba', `${appt?.date} ${appt?.time}`);
  await closeModals(page);
  await page.waitForSelector(`#ag-body [data-detail="${appt.id}"]`);
  await page.click(`#ag-body [data-detail="${appt.id}"]`);
  await page.waitForSelector(`${top} [data-arrive]`);
  await page.click(`${top} [data-arrive]`);
  await sleep(1200);
  appt = await store(page, (s, id) => s.appointment(id), appt.id);
  ok('Paciente en sala de espera', appt.status === 'espera');
  await closeModals(page);
  // Atender
  await nav(page, 'inicio');
  await page.waitForSelector(`[data-attend="${appt.id}"]`);
  await page.click(`[data-attend="${appt.id}"]`);
  await page.waitForSelector('.consult-modal .rp-head', { timeout: 15000 });
  ok('Alertas de alergia e hipertensión en la atención', await page.evaluate(() => { const t = document.querySelector('.consult-modal').innerText; return t.includes('Penicilina') && t.includes('Hipertensión'); }));
  await page.type('.consult-modal [data-v="ta"]', '150/95');
  await page.type('.consult-modal [data-v="peso"]', '68');
  await sleep(400);
  await shot(page, '18-evaluacion.png');
  // Odontograma: caries O y M en 16 y endodoncia indicada en 46
  await page.click('.consult-modal [data-tab="odo"]'); await sleep(600);
  await page.click('.consult-modal [data-tool="caries"]');
  await page.click('.consult-modal [data-odo-ed] svg[data-tooth="16"] rect[data-s="O"]'); await sleep(200);
  await page.click('.consult-modal [data-odo-ed] svg[data-tooth="16"] polygon[data-s="M"]'); await sleep(200);
  await page.click('.consult-modal [data-tool="endo_indicada"]');
  await page.click('.consult-modal [data-odo-ed] svg[data-tooth="46"]'); await sleep(300);
  const findings = await page.evaluate(() => document.querySelector('.consult-modal [data-findings]').innerText);
  ok('Hallazgos marcados en el odontograma', findings.includes('16') && findings.includes('46'), findings.replace(/\s+/g, ' ').slice(0, 80));
  ok('Índice CPO-D calculado', await page.evaluate(() => /CPO-D\s*1/.test(document.querySelector('.consult-modal').innerText)));
  await page.type('.consult-modal [data-cie]', 'pulpitis'); await sleep(600);
  await page.type('.consult-modal [data-dxtooth]', '46');
  await page.click('.consult-modal [data-dx]'); await sleep(500);
  await shot(page, '19-odontograma.png');
  // Presupuesto desde el odontograma
  await page.click('.consult-modal [data-mkplan]');
  await page.waitForSelector(`${top} [data-suggest]`, { timeout: 10000 });
  await page.click(`${top} [data-suggest]`); await sleep(500);
  const sugg = await page.evaluate(() => document.querySelectorAll('.modal-backdrop:last-child .plan-line').length);
  ok('Presupuesto sugerido desde los hallazgos', sugg >= 2, `${sugg} tratamientos`);
  await shot(page, '20-presupuesto-editor.png');
  await page.click(`${top} [data-save="presentado"]`);
  await sleep(2000);
  const plan = await store(page, (s, id) => s.plans.find((p) => p.patientId === id), pt.id);
  ok('Presupuesto creado y presentado', plan?.status === 'presentado' && plan.items.length >= 2, `${plan?.number} · ${plan?.items.map((i) => i.code + ' ' + (i.tooth || '')).join(', ')}`);
  // Tratamientos de hoy: la resina del presupuesto + una profilaxis cobrada
  await page.click('.consult-modal [data-tab="proc"]'); await sleep(700);
  const resin = plan.items.find((i) => i.tooth === 16);
  await page.evaluate((sel) => document.querySelector(sel).click(), `.consult-modal [data-pi="${plan.id}|${resin.id}"]`); await sleep(700);
  ok('Tratamiento del presupuesto marcado como realizado hoy', await page.evaluate(() => document.querySelector('.consult-modal').innerText.includes('Del presupuesto')));
  await page.type('.consult-modal [data-pq]', 'profilaxis'); await sleep(500);
  await page.click('.consult-modal [data-padd="0"]'); await sleep(500);
  await page.click('.consult-modal [data-an-add]'); await sleep(500);
  ok('Anestesia: sugiere sin vasoconstrictor al hipertenso y calcula dosis máxima', await page.evaluate(() => { const t = document.querySelector('.consult-modal').innerText; return t.includes('Mepivacaína 3 %') || t.includes('Dosis máxima'); }));
  await shot(page, '21-tratamientos.png');
  // Récipe con alerta de alergia
  await page.click('.consult-modal [data-tab="rx"]'); await sleep(400);
  await page.type('.consult-modal [data-med]', 'amoxicilina'); await sleep(600);
  ok('Detecta medicamento contraindicado por alergia', (await page.$$('.consult-modal .med-opt.conflict')).length >= 1);
  await page.$eval('.consult-modal [data-med]', (e) => { e.value = ''; });
  await page.type('.consult-modal [data-med]', 'ibuprofeno'); await sleep(600);
  await page.evaluate(() => document.querySelector('.consult-modal [data-addmed]').click()); await sleep(800);
  ok('Medicamento agregado al récipe', await page.evaluate(() => /ibuprofeno/i.test(document.querySelector('.consult-modal').innerText)));
  // Documentos: récipe y consentimiento
  await page.click('.consult-modal [data-tab="docs"]'); await sleep(500);
  await page.evaluate(() => document.querySelector('.consult-modal [data-doc="recipe"]').click()); await sleep(2500);
  await page.evaluate(() => document.querySelector('.consult-modal [data-doc="consent"]').click()); await sleep(2500);
  await shot(page, '22-documentos.png');
  // Cierre y cobro
  await page.click('.consult-modal [data-tab="close"]'); await sleep(500);
  const prodId = await store(page, (s) => s.products.find((p) => p.name.startsWith('Cepillo Prueba')).id);
  await page.select('.consult-modal [data-add-prod]', prodId); await sleep(600);
  await page.click('.consult-modal [data-nvq="30"]').catch(() => {}); await sleep(700);
  await shot(page, '23-cierre.png');
  const expected = loc1.pv01 + 60 + loc1.d01;
  const totalTxt = await page.$eval('.consult-modal [data-close-pay]', (b) => b.textContent);
  ok('Total: evaluación + profilaxis + cepillo (la resina va por el presupuesto)', totalTxt.replace(/\D/g, '').includes(String(expected)), totalTxt.trim());
  await page.evaluate(() => document.querySelector('.consult-modal [data-close-pay]').click());
  await payWith(page, 'efectivo');
  await waitText(page, 'Atención cerrada', 15000);
  await shot(page, '24-atencion-cerrada.png');
  ok('Ofrece abonar al presupuesto al cerrar', await page.evaluate((n) => document.querySelector('.modal-backdrop:last-child').innerText.includes('Abonar a ' + n), plan.number));
  await closeModals(page); await sleep(1500);
  let cs = await consults(page);
  const c1 = cs.find((c) => c.patientId === pt.id);
  ok('Atención cerrada y cobrada', c1?.status === 'cerrada' && c1.billing === 'pagada' && !!c1.saleId, `${c1?.number} · ${c1?.billing}`);
  ok('Dos documentos verificables emitidos', c1?.docs.length === 2, c1?.docs.map((x) => x.kind).join(', '));
  const vdoc = await readPublic(page, c1.docs[0].code);
  ok('Documento público con datos del odontólogo', vdoc?.valid === true && vdoc.doctor?.cov === '123456' && vdoc.patient?.initials, vdoc?.kindLabel);
  const after = await store(page, (s, a) => ({ stock: s.products.find((p) => p.name.startsWith('Cepillo Prueba')).stock, appt: s.appointments.filter((x) => x.patientId === a.pt).map((x) => x.status), p: s.patient(a.pt), shift: s.openShift, plan: s.plan(a.plan) }), { pt: pt.id, plan: plan.id });
  ok('Insumo descontado del inventario', after.stock === 9, `stock ${after.stock}`);
  ok('Cita atendida', after.appt.includes('atendida'), after.appt.join(', '));
  ok('Odontograma del paciente: 16 con resina, 46 por tratar', after.p.odontogram?.teeth?.[16]?.s?.O === 'resina' && after.p.odontogram?.teeth?.[46]?.c?.includes('endo_indicada'), JSON.stringify(after.p.odontogram?.teeth?.[16]?.s || {}));
  ok('Presupuesto en curso con 1 tratamiento realizado', after.plan?.status === 'en_curso' && after.plan.items.filter((i) => i.status === 'realizado').length === 1, after.plan?.status);
  ok('Caja registra el cobro', after.shift.salesCount === 1 && Math.abs(after.shift.salesTotal - expected) < 0.01, `${after.shift.salesCount} · ${after.shift.salesTotal}`);
  // Abono al presupuesto (UI)
  await nav(page, 'presupuestos'); await sleep(1000);
  await page.click(`[data-p="${plan.id}"]`);
  await page.waitForSelector(`${top} [data-pay]`, { timeout: 10000 });
  await sleep(1500);
  await page.evaluate(() => document.querySelector('.modal-backdrop:last-child [data-pay]').click());
  await payWith(page, 'transferencia');
  await waitText(page, 'Abono registrado', 12000);
  await closeModals(page); await sleep(1200);
  const pl2 = await store(page, (s, id) => s.plan(id), plan.id);
  ok('Abono registrado en el presupuesto', pl2.paid > 0, `abonado ${pl2.paid}`);
  await shot(page, '25-presupuestos.png');
  // Laboratorio y periodontograma
  await store(page, async (s, id) => { const ops = await import('/js/ops.js'); await ops.saveLabOrder({ patient: s.patient(id), lab: 'Lab Prueba', work: 'Corona de zirconio 46', teeth: [46], cost: 1200, sentDate: new Date().toISOString().slice(0, 10), dueDate: '2000-01-01' }); }, pt.id);
  await sleep(1200);
  ok('Orden de laboratorio atrasada visible', await store(page, (s) => s.overdueLabs.length === 1));
  await store(page, async (s, id) => { const ops = await import('/js/ops.js'); await ops.savePerio(s.patient(id), { teeth: { 16: { pd: [5, 4, 6, 3, 3, 4], bop: [1, 0, 1, 0, 0, 0], pl: [1, 0], mob: 0, furca: 0, rec: 0, missing: false } }, notes: 'Prueba' }); }, pt.id);
  ok('Periodontograma guardado', (await store(page, async (s, id) => (await (await import('/js/perio.js')).patientPerios(id)).length, pt.id)) === 1);
  // Atención sin cita que queda por cobrar
  await store(page, async (s) => {
    const ops = await import('/js/ops.js');
    const p = await ops.savePatient({ name: 'Pedro Pendiente', idDoc: 'PEPE700101', sex: 'M', birthDate: '1970-01-01', phone: '55 1112 2233', allergies: [], chronic: [] });
    const c = await ops.startConsultation({ patient: p });
    await ops.closeConsultation({ ...c, reason: 'Urgencia: dolor', charges: [{ id: 'x1', productId: null, name: 'Consulta de urgencia', qty: 1, price: s.proc('D03').price, cost: 0 }] }, {});
  });
  await sleep(1500);
  ok('Atención por cobrar en la lista de pendientes', (await store(page, (s) => s.pending.length)) === 1);
  await nav(page, 'cobrar');
  await page.waitForSelector('#pos-pend [data-pc]');
  await shot(page, '26-cobrar.png');
  await page.click('#pos-pend [data-pc]');
  await payWith(page, 'efectivo');
  await waitText(page, 'cobrada', 12000);
  await closeModals(page); await sleep(1000);
  ok('Atención pendiente cobrada', (await store(page, (s) => s.pending.length)) === 0);
  // Cobro de un procedimiento del arancel + insumo
  await page.waitForSelector('#pos-grid .pcard');
  await clickText(page, '#pos-grid .pcard', 'Aplicación tópica de flúor');
  await page.click('#pos-tabs [data-tab="all"]').catch(() => {}); await sleep(300);
  await clickText(page, '#pos-grid .pcard', 'Cepillo Prueba');
  await sleep(300);
  await page.click('#c-pay');
  await payWith(page, 'efectivo');
  await sleep(2000);
  await closeModals(page);
  const sh = await store(page, (s) => ({ shift: s.openShift, stock: s.products.find((p) => p.name.startsWith('Cepillo Prueba')).stock }));
  ok('Cobro de procedimiento + insumo', sh.stock === 8 && sh.shift.salesCount === 4, `ventas ${sh.shift.salesCount} · stock ${sh.stock}`);
  // Facturación: anular el último cobro
  await nav(page, 'facturas');
  await page.waitForSelector('[data-view]');
  await shot(page, '27-facturacion.png');
  const invId = await page.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('flúor') || tr.innerText.includes('Cepillo')); return (row || document.querySelector('tbody tr'))?.querySelector('[data-view]')?.dataset.view; });
  await page.click(`[data-view="${invId}"]`);
  await page.waitForSelector(`${top} [data-void]`);
  await page.click(`${top} [data-void]`);
  await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [data-r]`);
  await page.type(`${top} [data-r]`, 'Prueba de anulación');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  await closeModals(page);
  const voided = await store(page, (s) => s.products.find((p) => p.name.startsWith('Cepillo Prueba')).stock);
  ok('Anular devuelve el insumo al inventario', voided === 9, `stock ${voided}`);
  // Búsqueda global encuentra el presupuesto
  await page.evaluate(async () => (await import('/js/views/search.js')).openSearch());
  await page.waitForSelector('.search-modal [data-q]');
  await page.type('.search-modal [data-q]', plan.number); await sleep(500);
  ok('Búsqueda global encuentra el presupuesto', !!(await page.$('.search-modal [data-pl]')));
  await closeModals(page);
  // Reportes, atenciones, inventario, ajustes
  await nav(page, 'reportes');
  await sleep(600);
  if (await page.$(`${top} [data-pin]`)) await typePin(page, acc.sede01.pin);
  await sleep(2500);
  ok('Reportes con producción y presupuestos', await page.evaluate(() => document.querySelector('.view-title')?.textContent.includes('Reportes') && document.body.innerText.includes('Presupuestos')));
  await shot(page, '28-reportes.png');
  await nav(page, 'consultas'); await sleep(1000);
  ok('Historial de atenciones', await page.evaluate((n) => document.body.innerText.includes(n), c1.number));
  await nav(page, 'inventario'); await sleep(1000);
  await shot(page, '29-insumos.png');
  await nav(page, 'ajustes'); await sleep(800);
  await shot(page, '30-ajustes.png');
  // Seguridad
  const leak = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', other, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede01 NO puede leer datos de sede02', leak === 'permission-denied', leak);
  const leakPt = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.getDocs(f.collection(f.db, 'tenants', other, 'plans')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede01 NO puede leer presupuestos de sede02', leakPt === 'permission-denied', leakPt);
  const selfPlan = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'tenants', me), { paidUntil: null, plan: 'Premium' }, { merge: true }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede01.uid);
  ok('Sede no puede cambiar su propio plan', selfPlan === 'permission-denied', selfPlan);
  const fakeDoc = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'verify', 'FAKE001'), { tenantId: other, valid: true }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('No se puede emitir documento a nombre de otra sede', fakeDoc === 'permission-denied', fakeDoc);
  const listV = await page.evaluate(async () => { const f = await import('/js/firebase.js'); try { await f.getDocs(f.collection(f.db, 'verify')); return 'listado'; } catch (e) { return e.code; } });
  ok('Nadie puede listar los documentos', listV === 'permission-denied', listV);
  // Cierre de caja
  await nav(page, 'caja');
  await page.waitForSelector('#k-close');
  await page.click('#k-close');
  await sleep(600);
  if (await page.$(`${top} [data-pin]`)) await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [name="usd"]`);
  await page.type(`${top} [name="usd"]`, '1000');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  ok('Cierre de caja', !(await store(page, (s) => s.openShift)));
  await closeModals(page);
  // Móvil
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  let maxOver = 0;
  for (const v of ['inicio', 'agenda', 'pacientes', 'presupuestos', 'laboratorio', 'cobrar', 'consultas', 'caja', 'inventario', 'ajustes']) {
    await page.evaluate((v) => { location.hash = '#/' + v; }, v); await sleep(1100);
    if (v === 'inicio') await shot(page, '31-movil-inicio.png');
    if (v === 'presupuestos') await shot(page, '32-movil-presupuestos.png');
    maxOver = Math.max(maxOver, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  }
  ok('Móvil sin desborde horizontal', maxOver <= 1, `${maxOver}px`);
  await ctx.close();

  // ==================================================================
  console.log('\n4) Panel del administrador');
  ({ ctx, page } = await newPage());
  await login(page, 'admin', acc.admin.password);
  await waitText(page, 'Panel de administración de sedes', 20000);
  await page.waitForSelector('[data-enter]');
  await sleep(1500);
  await shot(page, '27-admin.png');
  ok('Admin ve las sedes', (await page.$$('[data-enter]')).length >= 3);
  await page.click(`[data-tog="${acc.sede02.uid}"]`);
  await page.waitForSelector(`${top} [data-ok]`);
  await page.click(`${top} [data-ok]`);
  await sleep(900);
  ok('Sede02 congelada', await page.evaluate(() => document.body.innerText.includes('Congelada')));
  await page.click('#a-new');
  await page.waitForSelector(`${top} [name="name"]`);
  await page.type(`${top} [name="name"]`, 'Consultorio Prueba');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Sede creada', 20000);
  const newPass = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Contraseña')).querySelector('b').textContent);
  const newUser = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Usuario')).querySelector('b').textContent);
  ok('Nueva sede creada desde el panel', !!newPass, newUser);
  await page.keyboard.press('Escape');
  await page.waitForSelector(`[data-enter="${acc.sede01.uid}"]`, { timeout: 20000 });
  await sleep(500);
  await page.click(`[data-enter="${acc.sede01.uid}"]`);
  await waitText(page, 'Modo administrador', 20000);
  await sleep(1500);
  ok('Admin entra a la sede01', (await store(page, (s) => s.patients.length)) === 2);
  const demoGone = await page.evaluate(async (uid) => { const f = await import('/js/firebase.js'); return (await f.getDoc(f.doc(f.db, 'tenants', uid))).exists(); }, demoUid);
  ok('La demo se borró al terminar', demoGone === false);
  const demoPts = await page.evaluate(async (uid) => { const f = await import('/js/firebase.js'); return (await f.getDocs(f.collection(f.db, 'tenants', uid, 'patients'))).size; }, demoUid);
  ok('Pacientes de la demo borrados', demoPts === 0, `${demoPts}`);
  await ctx.close();

  // ==================================================================
  console.log('\n5) Sede congelada y sede nueva');
  ({ ctx, page } = await newPage());
  await login(page, 'sede02', acc.sede02.password);
  await waitText(page, 'Cuenta congelada', 20000);
  ok('Sede congelada ve el bloqueo con WhatsApp', await page.evaluate(() => !!document.querySelector('a[href*="584221906045"]')));
  const frozenRead = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', me, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede congelada no puede leer datos (reglas)', frozenRead === 'permission-denied', frozenRead);
  const demoDoc = await readPublic(page, demoCode);
  ok('Documentos de la demo borrados', demoDoc === null, String(demoDoc));
  await page.click('#blk-out');
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', newUser);
  await page.type('#lg-pass', newPass);
  await page.click('#lg-btn');
  await page.waitForSelector('.sb-nav', { timeout: 20000 });
  ok('Sede nueva inicia sesión', await page.evaluate(() => document.body.innerText.includes('Consultorio Prueba')));
  await ctx.close();
} catch (e) {
  console.error('\nERROR EN LA PRUEBA:', e.message);
  results.push(['FALLA', 'Excepción', e.message]);
  try {
    const pgs = (await Promise.all(browser.browserContexts().map((c) => c.pages()))).flat();
    const pg = pgs.at(-1);
    await pg.screenshot({ path: path.join(SHOTS, 'zz-error.png') });
    console.error(await pg.evaluate(() => document.querySelector('.modal-backdrop:last-child')?.innerText.slice(0, 500)));
  } catch { /* sin captura */ }
} finally {
  await browser.close();
}
console.log('\nErrores de la página:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'ninguno');
const fails = results.filter((r) => r[0] !== 'OK ');
console.log(`\nRESULTADO: ${results.length - fails.length}/${results.length} OK`);
process.exit(fails.length || errors.length ? 1 : 0);
