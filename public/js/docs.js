// Sano Dental — Documentos odontológicos imprimibles con QR de verificación
import { store, SEX, APPT_TYPES } from './store.js';
import { esc, fmtDate, fmtDateTime, fmtTime, printHTML, addDays, fromKey, usd, bs, loc } from './utils.js';
const ID = () => loc().id || 'Doc.';
const licLine = (d) => [d.cov && (loc().lic || 'Reg.') + ' ' + esc(d.cov), d.mpps && loc().lic2 && loc().lic2 + ' ' + esc(d.mpps)].filter(Boolean).join(' · ');
import { issueDocument, verifyUrl, planTotals } from './ops.js';
import { qrDataURL, PRINT_HEAD } from './shared.js';
import { ageText, VITALS, CONSENTS, medicalAlerts } from './clinical.js';
import { renderOdo, odoSummary, indices, toothName } from './odontogram.js';
import { perioStats } from './perio.js';

// ======================================================================
// CANTIDAD DEL RÉCIPE: "1 tableta cada 8 horas por 7 días" → 21
// ======================================================================
const FRACTIONS = { '½': 0.5, '1/2': 0.5, '¼': 0.25, '1/4': 0.25, '¾': 0.75 };
export function rxQty(r) {
  const dose = String(r.dose || '').toLowerCase();
  const fr = String(r.frequency || '').toLowerCase();
  const du = String(r.duration || '').toLowerCase();
  if (!/(tableta|cápsula|capsula|comprimido|sobre|óvulo|ovulo|ampolla|parche|gragea|tab|cáps)/.test(dose + ' ' + String(r.presentation || '').toLowerCase())) return '';
  let units = null;
  for (const [k, v] of Object.entries(FRACTIONS)) if (dose.startsWith(k)) units = v;
  if (units == null) { const m = dose.match(/^(\d+(?:[.,]\d+)?)/); if (m) units = parseFloat(m[1].replace(',', '.')); }
  if (!units) return '';
  if (/dosis única|dosis unica/.test(fr)) return String(Math.ceil(units));
  let perDay = null;
  const h = fr.match(/cada\s+(\d+)\s*hora/); if (h) perDay = 24 / Number(h[1]);
  if (perDay == null && /(una vez al d|en la mañana|en la noche|en ayunas|al acostarse|diaria)/.test(fr)) perDay = 1;
  if (perDay == null && /(cada comida|con almuerzo y cena)/.test(fr)) perDay = /almuerzo y cena/.test(fr) ? 2 : 3;
  if (perDay == null && /semana/.test(fr)) perDay = 1 / 7;
  if (perDay == null) return '';
  let days = null;
  const d = du.match(/(\d+)\s*d[ií]a/); if (d) days = Number(d[1]);
  const w = du.match(/(\d+)\s*semana/); if (w) days = Number(w[1]) * 7;
  const mo = du.match(/(\d+)\s*mes/); if (mo) days = Number(mo[1]) * 30;
  if (!days) return '';
  return String(Math.ceil(units * perDay * days));
}

// ======================================================================
// ENCABEZADOS
// ======================================================================
const docOf = (c) => store.doctor(c?.doctorId) || store.mainDoctor || {};
const drName = (d) => d.name ? (/^(dr|dra)\.?\s/i.test(d.name) ? d.name : `${d.sex === 'F' ? 'Dra.' : 'Dr.'} ${d.name}`) : 'Odontólogo tratante';

function doctorHead(d, compact = false) {
  const s = store.settings;
  return `<div class="dh">
    <div class="dh-l">
      <div class="dh-n">${esc(drName(d))}</div>
      <div class="dh-s">${esc(d.specialty || 'Odontólogo')}${d.university ? ' · ' + esc(d.university) : ''}</div>
      <div class="dh-r">${[d.idDoc && ID() + ' ' + esc(d.idDoc), licLine(d)].filter(Boolean).join(' · ')}</div>
    </div>
    ${compact ? '' : `<div class="dh-c"><b>${esc(store.businessName)}</b>${s.rif ? `<span>${esc(loc().tax || 'NIT')} ${esc(s.rif)}</span>` : ''}${s.address ? `<span>${esc(s.address)}</span>` : ''}<span>${[s.phone && 'Tel. ' + esc(s.phone), s.email && esc(s.email)].filter(Boolean).join(' · ')}</span></div>`}
  </div>`;
}
function patientLine(c, extra = '') {
  return `<div class="pl"><div><span>Paciente:</span> <b>${esc(c.patientName)}</b></div><div><span>${esc(ID())}:</span> ${esc(c.patientIdDoc || '—')}</div><div><span>Edad:</span> ${esc(ageText(c.patientBirth) || (c.age != null ? c.age + ' años' : '—'))}</div><div><span>Fecha:</span> ${fmtDate(c.closedAt || c.startedAt || new Date().toISOString())}</div>${extra}</div>`;
}
function signBlock(d, qr, code) {
  return `<div class="sg">
    ${qr ? `<div class="qr"><img src="${qr}"><div>Verifique este documento<br><b>${esc(code)}</b></div></div>` : '<div></div>'}
    <div class="sg-l">${d.signature ? `<img src="${d.signature}" class="sig">` : '<div style="height:46px"></div>'}<div class="sg-line">${esc(drName(d))}</div><div class="sg-sub">${licLine(d) || 'Firma y sello'}</div></div>
  </div>`;
}
const BASE_CSS = `
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #10212a; margin: 0; font-size: 12.5px; }
  .dh { display: flex; justify-content: space-between; gap: 18px; border-bottom: 3px solid #0284c7; padding-bottom: 8px; }
  .dh-n { font-size: 18px; font-weight: 800; color: #0c2d48; } .dh-s { font-weight: 700; color: #0284c7; font-size: 12px; } .dh-r { font-size: 11px; color: #4a5d66; margin-top: 2px; }
  .dh-c { text-align: right; display: flex; flex-direction: column; font-size: 10.5px; color: #4a5d66; } .dh-c b { color: #0c2d48; font-size: 12px; }
  .pl { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 7px 0; border-bottom: 1px solid #d5e3e6; font-size: 11.5px; } .pl span { color: #5a6d75; }
  h1 { font-size: 16px; text-align: center; letter-spacing: .14em; color: #0c2d48; margin: 16px 0 10px; }
  h3 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #0284c7; margin: 12px 0 4px; border-bottom: 1px solid #d5e3e6; padding-bottom: 2px; }
  .txt { line-height: 1.6; text-align: justify; font-size: 13px; } .pre { white-space: pre-wrap; }
  .sg { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 18px; }
  .sg-l { text-align: center; min-width: 210px; } .sig { max-height: 62px; max-width: 200px; display: block; margin: 0 auto -6px; }
  .sg-line { border-top: 1px solid #000; padding-top: 3px; font-weight: 700; font-size: 11.5px; } .sg-sub { font-size: 10px; color: #4a5d66; }
  .qr { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #4a5d66; line-height: 1.3; } .qr img { width: 70px; height: 70px; }
  .foot { font-size: 9px; color: #6b7d85; text-align: center; margin-top: 10px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 11.5px; } table.t th { background: #0284c7; color: #fff; text-align: left; padding: 4px 6px; } table.t td { padding: 4px 6px; border-bottom: 1px solid #e1ecee; vertical-align: top; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; font-size: 12px; } .grid span { color: #5a6d75; }
  .chips span { display: inline-block; border: 1px solid #c9dade; border-radius: 99px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
  .odo { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 6px 0; } .odo-row { display: flex; justify-content: center; } .odo-half { display: flex; } .odo-mid { width: 2px; background: #94a3b8; margin: 0 4px; }
  .odo-sep { width: 100%; max-width: 680px; border-top: 1.5px dashed #94a3b8; margin: 3px 0; } .odo-side { width: 100%; max-width: 680px; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .08em; }
  .odo svg.tooth { width: 40px; height: 72px; } .odo-row.temp svg.tooth { width: 34px; height: 61px; }
  .oleg { font-size: 10px; color: #4a5d66; text-align: center; } .oleg b.r { color: #dc2626; } .oleg b.b { color: #2563eb; }
  .alert { border: 1.5px solid #dc2626; color: #b91c1c; border-radius: 6px; padding: 4px 8px; font-weight: 700; font-size: 11.5px; margin-top: 6px; }`;

function page(title, body, { landscape = false, margin = '10mm' } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title><style>@page { size: letter ${landscape ? 'landscape' : 'portrait'}; margin: ${margin}; }${BASE_CSS}</style></head><body>${body}</body></html>`);
}
async function codeAndQr(c, kind, summary) {
  const code = await issueDocument(c, kind, summary);
  return { code, qr: await qrDataURL(verifyUrl(code), 3) };
}

// ======================================================================
// RÉCIPE E INDICACIONES
// ======================================================================
export async function printRecipe(c) {
  const d = docOf(c);
  const rx = (c.rx || []).filter((r) => r.name);
  if (!rx.length) throw new Error('El récipe está vacío.');
  const { code, qr } = await codeAndQr(c, 'recipe', `${rx.length} medicamento(s): ${rx.map((r) => r.name).join(', ')}`.slice(0, 200));
  const note = store.settings.rxNote || '';
  const rxList = rx.map((r, i) => `<div class="rx"><b>${i + 1}.</b> <b>${esc(r.name)}</b> ${esc(r.presentation || '')}${r.qty || rxQty(r) ? ` <span class="q">#${esc(r.qty || rxQty(r))}</span>` : ''}</div>`).join('');
  const indList = rx.map((r, i) => `<div class="rx"><b>${i + 1}. ${esc(r.name)}</b><div>${esc([r.dose, r.frequency, r.duration && `por ${r.duration}`].filter(Boolean).join(', '))}${r.route && r.route !== 'Oral' ? ` · vía ${esc(r.route.toLowerCase())}` : ''}${r.note ? `. ${esc(r.note)}` : ''}</div></div>`).join('');
  const extra = c.indications ? `<div class="ind pre">${esc(c.indications)}</div>` : '';
  const next = c.nextVisit?.date ? `<div class="nv">Próximo control: <b>${fmtDate(c.nextVisit.date)}${c.nextVisit.time ? ' · ' + esc(c.nextVisit.time) : ''}</b></div>` : '';
  const allergy = c.allergies?.length ? `<div class="alert">Alérgico(a) a: ${esc(c.allergies.join(', '))}</div>` : '';
  const halfCSS = `.half { display: flex; flex-direction: column; } .rxh { font-size: 26px; font-weight: 800; color: #0284c7; font-family: Georgia, serif; margin: 10px 0 4px; }
    .rx { margin: 7px 0; line-height: 1.45; font-size: 13px; } .q { font-weight: 800; color: #0c2d48; } .ind { margin-top: 8px; font-size: 12.5px; line-height: 1.5; } .nv { margin-top: 10px; font-size: 12px; }
    .grow { flex: 1; } .note { font-size: 9.5px; color: #4a5d66; border-top: 1px dashed #b6c9ce; padding-top: 4px; margin-top: 8px; }`;
  const half = (title, list, after = '') => `<div class="half">${doctorHead(d, true)}${patientLine(c)}${allergy}<div class="rxh">${title}</div><div class="grow">${list}${after}</div>${signBlock(d, qr, code)}<div class="note">${esc(note)} · ${esc(store.businessName)}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div></div>`;
  if ((store.settings.rxFormat || 'media') === 'media') {
    printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Récipe ${esc(c.number)}</title><style>@page { size: letter landscape; margin: 8mm; }${BASE_CSS}${halfCSS}
      .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 0; height: 190mm; } .sheet > .half { padding: 0 9mm; } .sheet > .half + .half { border-left: 1px dashed #8aa4ab; }</style></head><body>
      <div class="sheet">${half('Rp/', rxList)}${half('Indicaciones', indList, extra + next)}</div></body></html>`);
  } else {
    printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Récipe ${esc(c.number)}</title><style>@page { size: letter portrait; margin: 10mm; }${BASE_CSS}${halfCSS}
      .half { min-height: 125mm; } .half + .half { border-top: 1px dashed #8aa4ab; margin-top: 8mm; padding-top: 6mm; }</style></head><body>
      ${half('Rp/', rxList)}${half('Indicaciones', indList, extra + next)}</body></html>`);
  }
  return code;
}

// ======================================================================
// ORDEN DE EXÁMENES
// ======================================================================
export async function printLabOrder(c) {
  const d = docOf(c);
  const labs = c.labs || []; const img = c.imaging || [];
  if (!labs.length && !img.length) throw new Error('No hay exámenes indicados.');
  const { code, qr } = await codeAndQr(c, 'labs', `${labs.length} de laboratorio, ${img.length} de imagen`);
  const dx = (c.diagnoses || []).map((x) => `${x.code} ${x.name}`).join('; ');
  page(`Orden de exámenes ${c.number}`, `${doctorHead(d)}${patientLine(c)}
    <h1>ORDEN DE EXÁMENES</h1>
    ${labs.length ? `<h3>Laboratorio</h3><div class="grid">${labs.map((l) => `<div>☐ ${esc(l)}</div>`).join('')}</div>` : ''}
    ${img.length ? `<h3>Estudios de imagen y especiales</h3><div class="grid">${img.map((l) => `<div>☐ ${esc(l)}</div>`).join('')}</div>` : ''}
    ${dx ? `<h3>Diagnóstico presuntivo</h3><div>${esc(dx)}</div>` : ''}
    ${c.labNote ? `<h3>Indicaciones</h3><div class="pre">${esc(c.labNote)}</div>` : ''}
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Dental</div>`);
  return code;
}

// ======================================================================
// REPOSO, CONSTANCIAS Y CERTIFICADO
// ======================================================================
export async function printRest(c, { days, from, includeDx = true }) {
  const d = docOf(c);
  const n = Math.max(1, Number(days) || 1);
  const start = from || new Date().toISOString().slice(0, 10);
  const end = addDays(fromKey(start), n - 1).toISOString().slice(0, 10);
  const { code, qr } = await codeAndQr(c, 'rest', `Reposo de ${n} día(s), del ${fmtDate(start)} al ${fmtDate(end)}`);
  const dx = (c.diagnoses || []).map((x) => `${x.name} (${x.code})`).join(', ');
  page(`Reposo ${c.number}`, `${doctorHead(d)}
    <h1>CONSTANCIA DE REPOSO</h1>
    <p class="txt">Quien suscribe, <b>${esc(drName(d))}</b>${licLine(d) ? ', ' + licLine(d) : ''}, hace constar que el(la) paciente <b>${esc(c.patientName)}</b>, titular del documento de identidad <b>${esc(c.patientIdDoc || '—')}</b>, de ${esc(ageText(c.patientBirth) || '—')} de edad, fue atendido(a) en consulta odontológica el día ${fmtDate(c.startedAt)}${includeDx && dx ? `, con diagnóstico de <b>${esc(dx)}</b>` : ''}, por lo cual amerita <b>REPOSO por ${n} (${numWords(n)}) día(s)</b>, desde el <b>${fmtDate(start)}</b> hasta el <b>${fmtDate(end)}</b>, ambos inclusive, debiendo reintegrarse a sus actividades el día <b>${fmtDate(addDays(fromKey(end), 1).toISOString().slice(0, 10))}</b>, salvo nueva evaluación.</p>
    <p class="txt">Constancia que se expide a petición de la parte interesada en ${esc(cityOf())}, a los ${expDate()}.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)}${store.settings.address ? ' · ' + esc(store.settings.address) : ''}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div>`);
  return code;
}

export async function printAttendance(c, { companion = '' } = {}) {
  const d = docOf(c);
  const { code, qr } = await codeAndQr(c, 'attendance', `Asistencia a consulta el ${fmtDate(c.startedAt)} de ${fmtTime(c.startedAt)} a ${fmtTime(c.closedAt || new Date().toISOString())}`);
  page(`Constancia ${c.number}`, `${doctorHead(d)}
    <h1>CONSTANCIA DE ASISTENCIA</h1>
    <p class="txt">Quien suscribe, <b>${esc(drName(d))}</b>, hace constar que el(la) ciudadano(a) <b>${esc(c.patientName)}</b>, cédula de identidad <b>${esc(c.patientIdDoc || '—')}</b>, asistió a consulta odontológica en <b>${esc(store.businessName)}</b> el día <b>${fmtDate(c.startedAt)}</b>, desde las <b>${fmtTime(c.startedAt)}</b> hasta las <b>${fmtTime(c.closedAt || new Date().toISOString())}</b>${companion ? `, acompañado(a) por <b>${esc(companion)}</b>` : ''}.</p>
    <p class="txt">Constancia que se expide a petición de la parte interesada en ${esc(cityOf())}, a los ${expDate()}.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Dental</div>`);
  return code;
}

// ======================================================================
// INFORME ODONTOLÓGICO Y REFERENCIA
// ======================================================================
function vitalsLine(v = {}) {
  const parts = VITALS.filter(([k]) => String(v[k] || '').trim()).map(([k, l, u]) => `${l}: ${esc(v[k])} ${u}`);
  return parts.join(' · ') || 'No registrados';
}
export async function printReport(c, patient = null) {
  const d = docOf(c);
  const p = patient || store.patient(c.patientId) || {};
  const { code, qr } = await codeAndQr(c, 'report', `Informe odontológico de la atención ${c.number}`);
  const sec = (t, v) => v ? `<h3>${t}</h3><div class="pre txt" style="font-size:12.5px">${esc(v)}</div>` : '';
  page(`Informe ${c.number}`, `${doctorHead(d)}${patientLine(c, `<div><span>Sexo:</span> ${esc(SEX[c.patientSex] || '—')}</div><div><span>HC:</span> ${esc(c.patientNumber || '—')}</div>`)}
    <h1>INFORME ODONTOLÓGICO</h1>
    ${sec('Motivo de consulta', c.reason)}${sec('Enfermedad actual', c.illness)}
    ${p.chronic?.length || p.personalHistory || p.surgicalHistory || p.allergies?.length ? `<h3>Antecedentes</h3><div class="txt" style="font-size:12.5px">${[p.chronic?.length && 'Patológicos: ' + esc(p.chronic.join(', ')), p.personalHistory && esc(p.personalHistory), p.surgicalHistory && 'Quirúrgicos: ' + esc(p.surgicalHistory), p.allergies?.length && '<b>Alergias: ' + esc(p.allergies.join(', ')) + '</b>', p.currentMeds && 'Medicación habitual: ' + esc(p.currentMeds)].filter(Boolean).join('<br>')}</div>` : ''}
    <h3>Signos vitales</h3><div style="font-size:12px">${vitalsLine(c.vitals)}</div>
    ${sec('Examen extraoral', c.extraoral)}${sec('Examen intraoral', [c.intraoral, c.hygiene && 'Higiene oral: ' + c.hygiene, c.occlusion && 'Oclusión: ' + c.occlusion].filter(Boolean).join('\n'))}
    ${odoBlock(c.odontogramAfter || c.odontogram)}
    ${c.diagnoses?.length ? `<h3>Impresión diagnóstica</h3><div>${c.diagnoses.map((x, i) => `${i + 1}. ${esc(x.name)}${x.tooth ? ` — diente ${esc(x.tooth)}` : ''} <span style="color:#5a6d75">(CIE-10 ${esc(x.code || '—')})</span>`).join('<br>')}</div>` : ''}
    ${c.procedures?.length ? `<h3>Tratamientos realizados</h3><div>${c.procedures.map((x) => `• ${x.tooth ? `<b>${esc(x.tooth)}</b> ` : ''}${esc(x.name)}${x.surfaces?.length ? ' (' + esc(x.surfaces.join('')) + ')' : ''}${x.note ? ' — ' + esc(x.note) : ''}`).join('<br>')}</div>` : ''}
    ${c.rx?.length ? `<h3>Tratamiento indicado</h3><div>${c.rx.map((r) => `• ${esc(r.name)} ${esc(r.presentation || '')}: ${esc([r.dose, r.frequency, r.duration && 'por ' + r.duration].filter(Boolean).join(', '))}`).join('<br>')}</div>` : ''}
    ${sec('Evolución y plan', c.plan)}
    ${c.labs?.length || c.imaging?.length ? `<h3>Exámenes solicitados</h3><div>${esc([...(c.labs || []), ...(c.imaging || [])].join(', '))}</div>` : ''}
    ${c.nextVisit?.date ? `<p>Próxima cita: <b>${fmtDate(c.nextVisit.date)}</b></p>` : ''}
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Informe generado con Sano Dental</div>`);
  return code;
}

export async function printReferral(c) {
  const d = docOf(c);
  const r = c.referral || {};
  if (!r.to) throw new Error('Indica la especialidad o el profesional al que refieres.');
  const { code, qr } = await codeAndQr(c, 'referral', `Referencia a ${r.to}`);
  page(`Referencia ${c.number}`, `${doctorHead(d)}${patientLine(c)}
    <h1>REFERENCIA ODONTOLÓGICA</h1>
    <p class="txt">Estimado(a) colega de <b>${esc(r.to)}</b>${r.doctor ? ` (${esc(r.doctor)})` : ''}:</p>
    <p class="txt">Por medio de la presente le refiero al(la) paciente <b>${esc(c.patientName)}</b>, de ${esc(ageText(c.patientBirth) || '—')} de edad, ${r.priority === 'urgente' ? '<b>con carácter URGENTE</b>, ' : ''}para su evaluación y conducta${r.reason ? ` por: <b>${esc(r.reason)}</b>` : ''}.</p>
    ${c.reason ? `<h3>Motivo de consulta</h3><div class="pre">${esc(c.reason)}${c.illness ? '\n' + esc(c.illness) : ''}</div>` : ''}
    <h3>Signos vitales</h3><div style="font-size:12px">${vitalsLine(c.vitals)}</div>
    ${c.diagnoses?.length ? `<h3>Impresión diagnóstica</h3><div>${c.diagnoses.map((x) => `${esc(x.name)}${x.tooth ? ' — diente ' + esc(x.tooth) : ''} (${esc(x.code || '—')})`).join('<br>')}</div>` : ''}
    ${c.xrayTeeth?.length || c.procedures?.length ? `<h3>Dientes involucrados</h3><div>${esc([...new Set([...(c.xrayTeeth || []), ...(c.procedures || []).map((x) => x.tooth)].filter(Boolean))].join(', '))}</div>` : ''}
    ${c.rx?.length ? `<h3>Tratamiento actual</h3><div>${c.rx.map((x) => `• ${esc(x.name)} ${esc(x.presentation || '')}`).join('<br>')}</div>` : ''}
    ${c.allergies?.length ? `<div class="alert">Alergias: ${esc(c.allergies.join(', '))}</div>` : ''}
    <p class="txt">Agradeciendo de antemano su atención y quedando a la espera de su contrarreferencia.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div>`);
  return code;
}

// ======================================================================
// HISTORIA CLÍNICA COMPLETA
// ======================================================================
export function printHistory(p, consults = []) {
  const d = store.mainDoctor || {};
  const list = consults.filter((c) => c.status === 'cerrada');
  page(`Historia ${p.number || ''} ${p.name}`, `${doctorHead(d)}
    <h1>HISTORIA CLÍNICA ODONTOLÓGICA</h1>
    <div class="grid">
      <div><span>Paciente:</span> <b>${esc(p.name)}</b></div><div><span>N° historia:</span> ${esc(p.number || '—')}</div>
      <div><span>${esc(ID())}:</span> ${esc(p.idDoc || '—')}</div><div><span>Nacimiento:</span> ${p.birthDate ? fmtDate(p.birthDate) + ' (' + esc(ageText(p.birthDate)) + ')' : '—'}</div>
      <div><span>Sexo:</span> ${esc(SEX[p.sex] || '—')}</div><div><span>Grupo sanguíneo:</span> ${esc(p.bloodType || '—')}</div>
      <div><span>Teléfono:</span> ${esc(p.phone || '—')}</div><div><span>Ocupación:</span> ${esc(p.occupation || '—')}</div>
      <div><span>Dirección:</span> ${esc(p.address || '—')}</div><div><span>Seguro:</span> ${esc(p.insurance || '—')}${p.insuranceNumber ? ' · ' + esc(p.insuranceNumber) : ''}</div>
      <div><span>Contacto de emergencia:</span> ${esc(p.emergencyName || '—')} ${esc(p.emergencyPhone || '')}</div><div><span>Paciente desde:</span> ${fmtDate(p.createdAt)}</div>
    </div>
    ${p.allergies?.length ? `<div class="alert">ALERGIAS: ${esc(p.allergies.join(', '))}${p.allergyNote ? ' — ' + esc(p.allergyNote) : ''}</div>` : ''}
    <h3>Antecedentes</h3>
    <div class="grid" style="grid-template-columns:1fr">
      <div><span>Patológicos:</span> ${esc((p.chronic || []).join(', ') || 'Niega')}${p.personalHistory ? '. ' + esc(p.personalHistory) : ''}</div>
      <div><span>Quirúrgicos:</span> ${esc(p.surgicalHistory || 'Niega')}</div>
      <div><span>Familiares:</span> ${esc(p.familyHistory || 'No refiere')}</div>
      <div><span>Medicación habitual:</span> ${esc(p.currentMeds || 'Ninguna')}</div>
      <div><span>Hábitos:</span> ${esc(habitsText(p.habits) || 'No refiere')}</div>
      <div><span>Antecedentes odontológicos:</span> ${esc(dentalText(p.dental) || 'No refiere')}</div>
      ${p.guardianName ? `<div><span>Representante:</span> ${esc(p.guardianName)}${p.guardianId ? ' · ' + ID() + ' ' + esc(p.guardianId) : ''}</div>` : ''}
    </div>
    ${p.odontogram && Object.keys(p.odontogram.teeth || {}).length ? odoBlock(p.odontogram) : ''}
    <h3>Atenciones (${list.length})</h3>
    ${list.length ? `<table class="t"><thead><tr><th style="width:90px">Fecha</th><th>Motivo / diagnóstico</th><th>Tratamientos realizados</th></tr></thead><tbody>${list.map((c) => `<tr><td>${fmtDate(c.startedAt)}<div style="color:#5a6d75;font-size:10px">${esc(c.number)} · ${esc(APPT_TYPES[c.type]?.label || '')}</div></td><td><b>${esc(c.reason || '')}</b>${c.diagnoses?.length ? '<br>' + c.diagnoses.map((x) => esc(`${x.code || ''} ${x.name}${x.tooth ? ' (' + x.tooth + ')' : ''}`)).join('<br>') : ''}<div style="color:#5a6d75;font-size:10.5px">${vitalsLine(c.vitals)}</div></td><td>${(c.procedures || []).map((x) => esc(`${x.tooth ? x.tooth + ' ' : ''}${x.name}`)).join('<br>') || '—'}${c.rx?.length ? `<div style="font-size:10.5px;color:#5a6d75">Rx: ${esc(c.rx.map((r) => r.name).join(', '))}</div>` : ''}${c.plan ? `<div style="font-size:10.5px">${esc(c.plan)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p>Sin atenciones registradas.</p>'}
    <div class="foot">Documento confidencial · ${esc(store.businessName)} · Generado ${fmtDateTime(new Date().toISOString())} con Sano Dental</div>`);
}

// ======================================================================
// ODONTOGRAMA, CONSENTIMIENTO, PRESUPUESTO Y PERIODONTOGRAMA
// ======================================================================
const DENTAL_LABELS = { cepillado: 'Cepillado', hilo: 'Hilo dental', enjuague: 'Enjuague', ultimaVisita: 'Última visita al odontólogo', bruxismo: 'Bruxismo', sangrado: 'Sangrado de encías', sensibilidad: 'Sensibilidad', habitos: 'Hábitos', ansiedad: 'Ansiedad dental', ortodonciaPrevia: 'Ortodoncia previa' };
export function dentalText(h = {}) {
  if (!h || typeof h !== 'object') return '';
  return Object.entries(DENTAL_LABELS).filter(([k]) => h[k]).map(([k, l]) => `${l}: ${h[k] === true ? 'Sí' : h[k]}`).join(' · ');
}
function odoBlock(odo, { title = 'Odontograma', detail = true } = {}) {
  if (!odo) return '';
  const ix = indices(odo); const list = odoSummary(odo);
  return `<h3>${title}</h3>${renderOdo(odo, { interactive: false })}
    <div class="oleg"><b class="r">Rojo:</b> hallazgo o por realizar · <b class="b">Azul:</b> existente o realizado · CPO-D ${ix.cpo} (C ${ix.C} · P ${ix.P} · O ${ix.O})${odo.dentition && odo.dentition !== 'permanente' ? ` · ceo-d ${ix.ceo}` : ''}</div>
    ${detail && list.length ? `<table class="t" style="margin-top:6px"><thead><tr><th style="width:50px">Diente</th><th>Hallazgo / estado</th></tr></thead><tbody>${list.map((f) => `<tr><td><b style="color:${f.pending ? '#dc2626' : '#2563eb'}">${f.n}</b></td><td>${esc(toothName(f.n))}: ${esc(f.text)}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

/** Odontograma del paciente (desde la ficha o la atención) */
export async function printOdontogram(p, odo, c = null) {
  const d = docOf(c);
  const src = c || { patientName: p.name, patientIdDoc: p.idDoc, patientBirth: p.birthDate, number: p.number, doctorId: d.id };
  const { code, qr } = await codeAndQr(src, 'odontogram', `Odontograma de ${p.name}`.slice(0, 200));
  page(`Odontograma ${p.name}`, `${doctorHead(d)}${patientLine(src, `<div><span>HC:</span> ${esc(p.number || '—')}</div>`)}
    <h1>ODONTOGRAMA</h1>${odoBlock(odo, { title: `Dentición ${odo?.dentition || 'permanente'}` })}
    ${odo?.notes ? `<h3>Observaciones</h3><div class="pre">${esc(odo.notes)}</div>` : ''}
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Dental</div>`);
  return code;
}

/** Consentimiento informado según el tipo de procedimiento */
export async function printConsent(c, { kind = 'general', teeth = '' } = {}) {
  const d = docOf(c);
  const k = CONSENTS[kind] || CONSENTS.general;
  const p = store.patient(c.patientId) || {};
  const birth = p.birthDate || c.patientBirth;
  const minor = birth && (Date.now() - new Date(birth).getTime()) / 31557600000 < 18;
  const signer = minor && p.guardianName ? p.guardianName : c.patientName;
  const signerId = minor && p.guardianId ? p.guardianId : (c.patientIdDoc || '');
  const { code, qr } = await codeAndQr(c, 'consent', `Consentimiento: ${k.title}${teeth ? ' · dientes ' + teeth : ''}`.slice(0, 200));
  const al = medicalAlerts(c.chronic || p.chronic || [], c.allergies || p.allergies || []);
  page(`Consentimiento ${c.number || ''}`, `${doctorHead(d)}${patientLine(c)}
    <h1>CONSENTIMIENTO INFORMADO</h1>
    <div style="text-align:center;font-weight:700;color:#0284c7;margin-top:-4px">${esc(k.title)}</div>
    <p class="txt">Yo, <b>${esc(signer)}</b>, titular del documento de identidad <b>${esc(signerId || '______________')}</b>${minor ? `, en mi condición de representante legal del(la) menor <b>${esc(c.patientName)}</b>` : ''}, autorizo a <b>${esc(drName(d))}</b>${d.cov ? ` (COV ${esc(d.cov)})` : ''} y a su equipo a realizar ${esc(k.proc)}${teeth ? `, en el(los) diente(s) <b>${esc(teeth)}</b>` : ''}.</p>
    <p class="txt">Se me ha explicado en lenguaje claro el diagnóstico, la naturaleza del procedimiento, sus beneficios y los siguientes <b>riesgos y complicaciones posibles</b>:</p>
    <ul class="txt" style="margin:4px 0 6px 18px;padding:0">${k.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <p class="txt"><b>Alternativas:</b> ${esc(k.alt)}</p>
    ${al.length ? `<p class="txt"><b>Condiciones médicas declaradas:</b> ${esc(al.map((a) => a.tag).join(', '))}.</p>` : ''}
    <p class="txt">Declaro que he informado con veracidad mis antecedentes médicos, alergias y medicamentos; que pude hacer preguntas y fueron respondidas a mi satisfacción; que me comprometo a seguir las indicaciones postoperatorias y que puedo revocar este consentimiento antes de iniciar el procedimiento. Entiendo que la odontología no es una ciencia exacta y que no se me han garantizado resultados.</p>
    <p class="txt">En ${esc(cityOf())}, a los ${expDate()}.</p>
    <div class="sg" style="margin-top:34px">
      <div class="sg-l"><div style="height:46px"></div><div class="sg-line">${esc(signer)}</div><div class="sg-sub">${minor ? 'Representante legal' : 'Paciente'} · ${esc(ID())} ${esc(signerId)} · Huella</div></div>
      <div class="sg-l"><div style="height:46px"></div><div class="sg-line">Testigo</div><div class="sg-sub">Nombre y ${esc(ID())}</div></div>
    </div>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Dental</div>`);
  return code;
}

/** Presupuesto / plan de tratamiento con fases, financiamiento y firmas */
export async function printBudget(plan) {
  const d = docOf(plan);
  const p = store.patient(plan.patientId) || {};
  const t = planTotals(plan);
  const src = { ...plan, patientBirth: p.birthDate, startedAt: plan.createdAt };
  const code = await issueDocument(plan, 'budget', `Presupuesto ${plan.number}: ${usd(t.total)}`, 'plans');
  const qr = await qrDataURL(verifyUrl(code), 3);
  const { PHASES, planFinancingText } = await import('./plans.js');
  const phases = [...new Set((plan.items || []).map((i) => i.phase || 1))].sort();
  const rows = phases.map((ph) => {
    const its = plan.items.filter((i) => (i.phase || 1) === ph);
    const sub = its.reduce((a, i) => a + i.price * (i.qty || 1), 0);
    return `<tr><td colspan="5" style="background:#eef6fb;font-weight:800;color:#0c2d48">${esc(PHASES[ph] || 'Fase ' + ph)}</td></tr>
      ${its.map((i) => `<tr><td>${esc(i.code || '')}</td><td><b>${i.tooth ? esc(i.tooth) : '—'}</b>${i.surfaces?.length ? ' ' + esc(i.surfaces.join('')) : ''}</td><td>${esc(i.name)}${i.note ? `<div style="color:#5a6d75;font-size:10px">${esc(i.note)}</div>` : ''}${i.status === 'realizado' ? ' <b style="color:#16a34a">✓ realizado</b>' : ''}</td><td style="text-align:center">${i.qty || 1}</td><td style="text-align:right">${usd(i.price * (i.qty || 1))}</td></tr>`).join('')}
      <tr><td colspan="4" style="text-align:right;color:#5a6d75">Subtotal de la fase</td><td style="text-align:right;font-weight:700">${usd(sub)}</td></tr>`;
  }).join('');
  page(`Presupuesto ${plan.number}`, `${doctorHead(d)}${patientLine(src, `<div><span>N°:</span> <b>${esc(plan.number)}</b></div><div><span>Válido hasta:</span> ${fmtDate(plan.validUntil)}</div>`)}
    <h1>PRESUPUESTO · PLAN DE TRATAMIENTO</h1>
    ${plan.title ? `<div style="text-align:center;font-weight:700;color:#0284c7;margin-top:-4px">${esc(plan.title)}</div>` : ''}
    ${plan.odontogram ? odoBlock(plan.odontogram, { title: 'Diagnóstico (odontograma)', detail: false }) : ''}
    <h3>Tratamientos</h3>
    <table class="t"><thead><tr><th style="width:52px">Cód.</th><th style="width:62px">Diente</th><th>Procedimiento</th><th style="width:40px;text-align:center">Cant.</th><th style="width:84px;text-align:right">Monto</th></tr></thead><tbody>${rows}</tbody></table>
    <table style="margin:8px 0 0 auto;font-size:12.5px;min-width:270px">
      <tr><td>Subtotal</td><td style="text-align:right">${usd(t.subtotal)}</td></tr>
      ${t.discount ? `<tr><td>Descuento</td><td style="text-align:right">- ${usd(t.discount)}</td></tr>` : ''}
      <tr><td style="font-size:15px;font-weight:800">TOTAL</td><td style="text-align:right;font-size:15px;font-weight:800;color:#0c2d48">${usd(t.total)}</td></tr>
      ${t.paid ? `<tr><td>Abonado</td><td style="text-align:right">${usd(t.paid)}</td></tr><tr><td><b>Saldo</b></td><td style="text-align:right"><b>${usd(t.balance)}</b></td></tr>` : ''}
    </table>
    ${plan.financing && (plan.financing.initial || plan.financing.installments) ? `<h3>Forma de pago</h3><div>${esc(planFinancingText(plan))}</div>` : ''}
    ${plan.notes ? `<h3>Observaciones</h3><div class="pre">${esc(plan.notes)}</div>` : ''}
    ${store.settings.planNote && store.settings.planNote.trim() !== String(plan.notes || '').trim() ? `<p style="font-size:10.5px;color:#4a5d66;margin-top:10px">${esc(store.settings.planNote)}</p>` : ''}
    <div class="sg" style="margin-top:30px">
      <div class="sg-l"><div style="height:46px"></div><div class="sg-line">Acepto: ${esc(plan.patientName)}</div><div class="sg-sub">${esc(ID())} ${esc(plan.patientIdDoc || '')} · Fecha</div></div>
      <div class="sg-l">${d.signature ? `<img src="${d.signature}" class="sig">` : '<div style="height:46px"></div>'}<div class="sg-line">${esc(drName(d))}</div><div class="sg-sub">${licLine(d) || 'Firma y sello'}</div></div>
    </div>
    <div class="sg" style="margin-top:8px"><div class="qr"><img src="${qr}"><div>Verifique este presupuesto<br><b>${esc(code)}</b></div></div><div></div></div>
    <div class="foot">${esc(store.businessName)}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''} · Sano Dental</div>`);
  return code;
}

/** Periodontograma impreso */
export function printPerio(p, exam) {
  const d = store.mainDoctor || {};
  const st = exam.stats?.avg != null ? exam.stats : perioStats(exam.teeth || {});
  const teeth = Object.keys(exam.teeth || {}).map(Number).sort((a, b) => a - b);
  const cell = (v) => (v === '' || v == null ? '·' : `<b style="color:${v >= 6 ? '#dc2626' : v >= 4 ? '#d97706' : '#10212a'}">${v}</b>`);
  page(`Periodontograma ${p.name}`, `${doctorHead(d)}${patientLine({ patientName: p.name, patientIdDoc: p.idDoc, patientBirth: p.birthDate, startedAt: exam.date })}
    <h1>PERIODONTOGRAMA</h1>
    <div class="grid"><div><span>Profundidad media:</span> <b>${esc(st.avg ?? '—')} mm</b></div><div><span>Sangrado al sondaje:</span> <b>${esc(st.bop ?? '—')} %</b></div><div><span>Índice de placa:</span> <b>${esc(st.plaque ?? '—')} %</b></div><div><span>Sitios ≥ 4 mm:</span> <b>${esc(st.deep ?? '—')}</b> · ≥ 6 mm: <b>${esc(st.severe ?? '—')}</b></div></div>
    <table class="t" style="margin-top:8px"><thead><tr><th>Diente</th><th>Vestibular (D · C · M)</th><th>Palatino / lingual (D · C · M)</th><th>Sangrado</th><th>Placa</th><th>Movilidad</th><th>Furca</th><th>Recesión</th></tr></thead><tbody>
    ${teeth.map((n) => { const t = exam.teeth[n] || {}; if (t.missing) return `<tr><td><b>${n}</b></td><td colspan="7" style="color:#64748b">Ausente</td></tr>`; const pd = t.pd || []; return `<tr><td><b>${n}</b></td><td>${[0, 1, 2].map((i) => cell(pd[i])).join(' · ')}</td><td>${[3, 4, 5].map((i) => cell(pd[i])).join(' · ')}</td><td>${(t.bop || []).filter(Boolean).length || '—'}</td><td>${(t.pl || []).filter(Boolean).length || '—'}</td><td>${esc(t.mob || '—')}</td><td>${esc(t.furca || '—')}</td><td>${esc(t.rec || '—')}</td></tr>`; }).join('')}
    </tbody></table>
    ${exam.notes ? `<h3>Diagnóstico periodontal y observaciones</h3><div class="pre">${esc(exam.notes)}</div>` : ''}
    ${signBlock(d, null, '')}<div class="foot">${esc(store.businessName)} · ${fmtDate(exam.date)} · Sano Dental</div>`);
}

export function habitsText(h = {}) {
  if (!h || typeof h !== 'object') return '';
  return [h.tabaco && `Tabaco: ${h.tabaco}`, h.alcohol && `Alcohol: ${h.alcohol}`, h.ejercicio && `Actividad física: ${h.ejercicio}`, h.drogas && `Otras sustancias: ${h.drogas}`, h.dieta && `Alimentación: ${h.dieta}`, h.sueno && `Sueño: ${h.sueno}`].filter(Boolean).join(' · ');
}
function cityOf() { const a = store.settings.address || ''; const parts = a.split(',').map((x) => x.trim()).filter(Boolean); return parts[parts.length - 1] || 'Venezuela'; }
/** «29 días del mes de octubre de 2026» (fórmula de constancias y certificados) */
function expDate(d = new Date()) { const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; const n = d.getDate(); return `${n} ${n === 1 ? 'día' : 'días'} del mes de ${M[d.getMonth()]} de ${d.getFullYear()}`; }
function numWords(n) {
  const w = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'];
  return w[n] || String(n);
}
