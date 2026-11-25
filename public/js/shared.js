// Sano Dental — Componentes compartidos: país y moneda, QR, WhatsApp al paciente e impresión de recibos
import { store, APPT_TYPES } from './store.js';
import { openModal, toast, num, esc, parseNum, fmtDateTime, fmtDate, setBusy, usd, bs, fx, methodLabel, qtyFmt, printHTML, todayKey, dayKey, waLink, addDays, COUNTRIES, loc, flagImg } from './utils.js';
import { icon } from './icons.js';

export const APP_NAME = 'Sano Dental';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa Sano Dental para mi consultorio. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// PAÍS DE TRABAJO (se elige una sola vez, al entrar por primera vez)
// ======================================================================
/** Selector de país. force: no se puede cerrar sin elegir. Resuelve con el código del país. */
export function openCountryPicker({ force = false } = {}) {
  return new Promise((resolve) => {
    let picked = store.settings.country || '';
    let cur = store.settings.currency || '';
    const list = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    const m = openModal({
      title: force ? '¿En qué país está tu consultorio?' : 'País y moneda', size: 'md', dismissible: true,
      sub: 'Según el país, Sano Dental trabaja con su moneda, sus formas de pago y el código telefónico para WhatsApp.',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Buscar país…" autocomplete="off"></label><div class="country-grid" data-l></div><div data-cur></div><div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary btn-lg" data-ok disabled>Continuar</button>`,
      onClose: () => resolve(picked && store.settings.country === picked ? picked : null)
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (qv = '') => {
      const t = qv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      m.el.querySelector('[data-l]').innerHTML = list.filter(([, c]) => !t || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).map(([k, c]) =>
        `<button type="button" class="country ${picked === k ? 'on' : ''}" data-c="${k}"><span class="flag">${flagImg(k, 24)}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.curName)} · ${esc(c.sym)}</small></span></button>`).join('');
      m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { picked = b.dataset.c; cur = COUNTRIES[picked].cur; draw(m.el.querySelector('[data-q]').value); });
      const c = COUNTRIES[picked];
      m.el.querySelector('[data-cur]').innerHTML = c ? `<div class="card stack" style="padding:12px 14px"><div class="row" style="gap:10px"><span class="flag">${flagImg(picked, 30)}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">Formas de pago: Efectivo, tarjetas, transferencia${(c.extra || []).length ? ' y otras locales' : ''} · WhatsApp +${esc(c.dial)}</div></div></div>
        ${c.alt ? `<div class="field"><label>Moneda con la que cobras</label><div class="seg seg-block">${[[c.cur, c.curName + ' (' + c.sym + ')'], [c.alt.cur, c.alt.curName + ' (' + c.alt.sym + ')']].map(([k, l]) => `<button type="button" data-mc="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>` : `<div class="small">Moneda: <b>${esc(c.curName)} (${esc(c.sym)})</b></div>`}
        ${store.settings.country && store.settings.country !== picked ? `<div class="vital-alert warning">Los montos ya registrados no se convierten: revisa los precios del arancel después de cambiar de país.</div>` : ''}</div>` : '';
      m.el.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { cur = b.dataset.mc; draw(m.el.querySelector('[data-q]').value); });
      m.el.querySelector('[data-ok]').disabled = !picked;
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      if (!picked) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { await store.setCountry(picked, cur); await (await import('./bcv.js')).onCountryChanged().catch(() => {}); toast(`Listo: trabajarás en ${loc().curName} (${loc().sym})`); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    draw();
  });
}

// ======================================================================
// MONEDA
// ======================================================================
export function moneyPair(v) { return `<b class="num">${usd(v)}</b>`; }
export const toBs = () => '';

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
/** Imagen (data URL) con el código QR del texto */
export async function qrDataURL(text, cell = 4) {
  try {
    const q = await loadQR();
    const qr = q(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL PACIENTE
// ======================================================================
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function apptWhen(a) {
  const d = new Date(a.date + 'T12:00');
  const rel = a.date === todayKey() ? 'hoy' : a.date === dayKey(addDays(new Date(), 1)) ? 'mañana' : `el ${DAY_NAMES[d.getDay()]} ${fmtDate(a.date)}`;
  const [h, m] = a.time.split(':').map(Number);
  const hh = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return `${rel} a las ${hh}`;
}

export function patientMessage(kind, { patient = {}, appt = null, consult = null, plan = null, extra = '' } = {}) {
  const name = String(patient.name || appt?.patientName || consult?.patientName || plan?.patientName || '').split(' ')[0];
  const biz = store.businessName;
  const doc = appt?.doctor || consult?.doctor || store.mainDoctor?.name || '';
  const addr = store.settings.address ? `\n📍 ${store.settings.address}` : '';
  const h = `Hola ${name} 👋, te escribimos de *${biz}*.`;
  const T = {
    agendada: () => `${h}\n\nTu cita quedó agendada para *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.\nMotivo: ${APPT_TYPES[appt.type]?.label || 'Cita odontológica'}${appt.reason ? ' · ' + appt.reason : ''}.${addr}\n\nSi no puedes asistir, avísanos para reprogramarla. ¡Te esperamos!`,
    recordatorio: () => `${h}\n\n📅 Te recordamos tu cita *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.${addr}\n\nPor favor responde *SÍ* para confirmar o escríbenos si necesitas cambiarla. Llega 10 minutos antes; si tienes radiografías recientes, tráelas. 🦷`,
    reprogramada: () => `${h}\n\nTu cita fue reprogramada para *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.${addr}\n\n¿Te queda bien? Responde *SÍ* para confirmar.`,
    no_asistio: () => `${h}\n\nTe esperábamos ${apptWhen(appt).replace(/^el /, 'el ')} y no pudiste asistir. ¿Quieres que te agendemos una nueva cita? Responde este mensaje y te damos los horarios disponibles.`,
    cancelada: () => `${h}\n\nTu cita de ${apptWhen(appt)} fue cancelada. Cuando quieras, escríbenos para agendar una nueva.`,
    control: () => `${h}\n\nYa es momento de tu *control odontológico*. ¿Te agendamos una cita? Responde con el día que te quede mejor.`,
    cumple: () => `🎉 ¡Feliz cumpleaños, ${name}! 🎂\n\nDe parte de todo el equipo de *${biz}* te deseamos un año lleno de sonrisas. 😁 ¡Cuídate mucho!`,
    indicaciones: () => `${h}\n\nResumen de tu atención ${consult?.number || ''}:${consult?.procedures?.length ? `\n\n🦷 *Realizado hoy:*\n${consult.procedures.map((x) => `• ${x.tooth ? 'Diente ' + x.tooth + ': ' : ''}${x.name}`).join('\n')}` : ''}${consult?.rx?.length ? '\n\n💊 *Medicamentos:*' : ''}\n${(consult?.rx || []).map((r, i) => `${i + 1}. *${r.name}* ${r.presentation || ''}: ${[r.dose, r.frequency, r.duration && `por ${r.duration}`].filter(Boolean).join(', ')}${r.note ? ` (${r.note})` : ''}`).join('\n') || '—'}${consult?.indications ? `\n\n${consult.indications}` : ''}${consult?.nextVisit?.date ? `\n\n📅 Control: ${fmtDate(consult.nextVisit.date)} a las ${consult.nextVisit.time}` : ''}\n\nCualquier duda o molestia, escríbenos. 😊`,
    recall: () => `${h}\n\n🦷 ¡Ya te toca tu *limpieza y control*! Han pasado unos meses desde tu última visita${patient.lastVisitAt ? ` (${fmtDate(patient.lastVisitAt)})` : ''}. Revisar a tiempo evita caries, dolor y tratamientos más costosos.\n\n¿Qué día te queda mejor para agendarte?`,
    presupuesto: () => { const t = planTotalsLite(plan); return `${h}\n\nTe compartimos tu *presupuesto ${plan?.number || ''}*${plan?.title ? ` (${plan.title})` : ''}:\n\n${(plan?.items || []).map((i) => `• ${i.tooth ? i.tooth + ' ' : ''}${i.name}: ${usd(i.price * (i.qty || 1))}`).join('\n')}\n${t.discount ? `\nDescuento: -${usd(t.discount)}` : ''}\n*Total: ${usd(t.total)}*${t.paid ? `\nAbonado: ${usd(t.paid)} · Saldo: *${usd(t.total - t.paid)}*` : ''}${plan?.validUntil ? `\nVálido hasta el ${fmtDate(plan.validUntil)}.` : ''}\n\n¿Tienes alguna duda? Con gusto te explicamos cada tratamiento y las formas de pago. 😊`; },
    laboratorio: () => `${h}\n\n✅ ¡Tu trabajo ya llegó del laboratorio! Escríbenos para agendar la cita de instalación.`,
    cobro: () => `${h}\n\nTe recordamos que tienes un saldo pendiente de *${usd(extra)}* ${plan ? `de tu presupuesto ${plan.number}` : `por tu atención ${consult?.number || ''}`}. ¡Gracias!`,
    libre: () => `${h}\n\n${extra || ''}`
  };
  return (T[kind] || T.libre)();
}
function planTotalsLite(plan) {
  const sub = (plan?.items || []).reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const discount = Math.min(sub, Number(plan?.discount) || 0);
  return { subtotal: sub, discount, total: sub - discount, paid: Number(plan?.paid) || 0 };
}
export function waPatient(kind, ctx = {}) {
  const phone = ctx.patient?.phone || ctx.appt?.patientPhone || ctx.consult?.patientPhone || ctx.plan?.patientPhone || '';
  const text = patientMessage(kind, ctx);
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN: recibos y documentos genéricos
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
function ticketCSS(fmt) {
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  return `@page { margin: ${fmt === 'carta' ? '12mm' : '2mm'}; }
    body { font-family: ${fmt === 'carta' ? 'Arial, Helvetica, sans-serif' : "'Courier New', monospace"}; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; }
    .big { font-size: 1.25em; font-weight: bold; } .sm { font-size: .85em; }`;
}
function headerHTML() {
  const s = store.settings;
  return `<div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">${esc(loc().tax)}: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}`;
}

/** Recibo de cobro (ticket o carta) */
export function receiptHTML(sale) {
  const s = store.settings;
  const rate = Number(sale.fxRate) || 0; const F = fx();
  const eq = (v) => (rate > 0 && F ? `${F.sym} ${num(v * rate, 2)}` : '');
  const ivaPct = Number(s.iva) || 0;
  const iva = ivaPct > 0 ? (sale.total - sale.total / (1 + ivaPct / 100)) : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td colspan="2">${esc(methodLabel(p.method))}</td><td class="r">${usd(p.amount)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(sale.number)}</title><style>${ticketCSS(s.receiptFormat)}</style></head><body>
    ${headerHTML()}
    <div class="hr"></div>
    <div class="c big">${esc(s.docTitle || 'RECIBO')}</div>
    <div class="c b">N° ${esc(sale.number)}</div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Paciente: ${esc(sale.patientName || 'Particular')}</div>
    ${sale.patientIdDoc ? `<div>${esc(loc().id)}: ${esc(sale.patientIdDoc)}</div>` : ''}
    ${sale.consultationNumber ? `<div>Atención: ${esc(sale.consultationNumber)}${sale.doctor ? ' · ' + esc(sale.doctor) : ''}</div>` : ''}
    ${sale.status === 'voided' ? '<div class="c b">*** DOCUMENTO ANULADO ***</div>' : ''}
    <div class="hr"></div>
    <table>${(sale.items || []).map((it) => `<tr><td colspan="2" style="padding-top:3px">${qtyFmt(it.qty)} x ${esc(it.name)}</td><td class="r">${usd(it.total ?? it.price * it.qty)}</td></tr>`).join('')}</table>
    <div class="hr"></div>
    <table>
      <tr><td colspan="2">Subtotal</td><td class="r">${usd(sale.subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td colspan="2">Descuento</td><td class="r">-${usd(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td colspan="2">TOTAL</td><td class="r">${usd(sale.total)}</td></tr>
      ${eq(sale.total) ? `<tr><td colspan="2">Equivalente</td><td class="r">${eq(sale.total)}</td></tr><tr><td colspan="3" class="sm">Tasa: 1 ${esc(loc().sym)} = ${num(rate, 2)} ${esc(F.sym)}</td></tr>` : ''}
      ${iva > 0.009 ? `<tr><td colspan="2">Impuesto ${num(ivaPct, 0)}% incluido</td><td class="r">${usd(iva)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${usd(sale.changeUSD)}</div>` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por su confianza!')}</div>
    <div class="c sm" style="margin-top:4px">Sano Dental</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

/** Documento imprimible genérico (reportes, cierres, listas) */
export function printDoc(title, inner) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #0284c7; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">Sano Dental — Gestión odontológica para tu consultorio</p>
  </body></html>`);
}

export function notifyLowStock(list) {
  if (!list?.length) return;
  const names = list.slice(0, 3).map((i) => `${i.name} (${qtyFmt(i.stock)})`).join(', ');
  toast(`Insumos por agotarse: ${names}${list.length > 3 ? ` y ${list.length - 3} más` : ''}`, 'warning', 6000);
}

export { usd, bs };
