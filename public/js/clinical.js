// Sano Dental — Catálogos clínicos odontológicos: CIE-10 bucal, vademécum, anestésicos, aranceles, alertas y consentimientos
import { normalize } from './utils.js';

// ======================================================================
// CIE-10: enfermedades de la cavidad bucal, glándulas salivales y maxilares (K00–K14) y afines
// ======================================================================
export const CIE10 = [
  ['K02.0', 'Caries limitada al esmalte'], ['K02.1', 'Caries de la dentina'], ['K02.2', 'Caries del cemento'], ['K02.3', 'Caries dentaria detenida'],
  ['K02.4', 'Odontoclasia'], ['K02.5', 'Caries con exposición pulpar'], ['K02.8', 'Otras caries dentales (caries recurrente)'], ['K02.9', 'Caries dental, no especificada'],
  ['K04.0', 'Pulpitis'], ['K04.01', 'Pulpitis reversible'], ['K04.02', 'Pulpitis irreversible'], ['K04.1', 'Necrosis de la pulpa'], ['K04.2', 'Degeneración de la pulpa (calcificaciones)'],
  ['K04.4', 'Periodontitis apical aguda de origen pulpar'], ['K04.5', 'Periodontitis apical crónica (granuloma)'],
  ['K04.6', 'Absceso periapical con fístula'], ['K04.7', 'Absceso periapical sin fístula'], ['K04.8', 'Quiste radicular'],
  ['K05.0', 'Gingivitis aguda'], ['K05.1', 'Gingivitis crónica'], ['K05.2', 'Periodontitis aguda (absceso periodontal)'], ['K05.3', 'Periodontitis crónica'],
  ['K05.4', 'Periodontosis'], ['K05.5', 'Otras enfermedades periodontales'], ['K05.6', 'Enfermedad periodontal, no especificada'],
  ['K06.0', 'Retracción gingival'], ['K06.1', 'Hiperplasia gingival'], ['K06.2', 'Lesiones gingivales y del reborde alveolar asociadas a traumatismo'], ['K06.8', 'Otros trastornos de la encía y del reborde alveolar'],
  ['K03.0', 'Atrición excesiva de los dientes'], ['K03.1', 'Abrasión de los dientes'], ['K03.2', 'Erosión de los dientes'], ['K03.3', 'Reabsorción patológica de los dientes'],
  ['K03.5', 'Anquilosis dental'], ['K03.6', 'Depósitos en los dientes (cálculo, placa, pigmentaciones)'], ['K03.7', 'Cambios posteruptivos del color de los tejidos duros'], ['K03.8', 'Sensibilidad dentinaria (hipersensibilidad)'],
  ['K00.0', 'Anodoncia (agenesia dental)'], ['K00.1', 'Dientes supernumerarios'], ['K00.2', 'Anomalías del tamaño y de la forma del diente'], ['K00.3', 'Dientes moteados (fluorosis)'],
  ['K00.4', 'Alteraciones en la formación dentaria (hipoplasia del esmalte)'], ['K00.6', 'Alteraciones en la erupción dentaria'], ['K00.7', 'Síndrome de la erupción dentaria'],
  ['K01.0', 'Dientes incluidos'], ['K01.1', 'Dientes impactados (cordal impactado)'],
  ['K07.1', 'Anomalías de la relación maxilobasilar'], ['K07.2', 'Anomalías de la relación entre los arcos dentarios (maloclusión clase II / III, mordida abierta o cruzada)'],
  ['K07.3', 'Anomalías de la posición del diente (apiñamiento, diastema, giroversión)'], ['K07.4', 'Maloclusión, no especificada'], ['K07.6', 'Trastornos de la articulación temporomandibular'],
  ['K08.1', 'Pérdida de dientes por accidente, extracción o enfermedad periodontal (edentulismo parcial)'], ['K08.2', 'Atrofia del reborde alveolar desdentado'], ['K08.3', 'Raíz dental retenida'],
  ['K08.8', 'Otras afecciones de los dientes (odontalgia)'], ['K08.9', 'Trastorno de los dientes y de sus estructuras de sostén, no especificado'],
  ['K09.0', 'Quistes originados por el desarrollo de los dientes'], ['K09.2', 'Otros quistes de los maxilares'], ['K10.2', 'Afecciones inflamatorias de los maxilares (osteítis)'], ['K10.3', 'Alveolitis del maxilar (alveolo seco)'],
  ['K11.2', 'Sialoadenitis'], ['K11.5', 'Sialolitiasis'], ['K11.7', 'Alteraciones de la secreción salival (xerostomía)'],
  ['K12.0', 'Estomatitis aftosa recurrente'], ['K12.1', 'Otras formas de estomatitis'], ['K12.2', 'Celulitis y absceso de boca'], ['K12.3', 'Mucositis oral'],
  ['K13.0', 'Enfermedades de los labios (queilitis)'], ['K13.1', 'Mordedura del labio y de la mejilla'], ['K13.2', 'Leucoplasia'], ['K13.7', 'Otras lesiones de la mucosa bucal'],
  ['K14.0', 'Glositis'], ['K14.1', 'Lengua geográfica'], ['K14.6', 'Glosodinia (ardor bucal)'],
  ['B37.0', 'Estomatitis candidiásica (candidiasis oral)'], ['B00.2', 'Gingivoestomatitis herpética'], ['B00.1', 'Herpes labial'],
  ['S02.5', 'Fractura de los dientes'], ['S03.2', 'Luxación de diente (avulsión)'], ['S01.5', 'Herida del labio y de la cavidad bucal'],
  ['F45.8', 'Bruxismo'], ['G50.0', 'Neuralgia del trigémino'], ['R19.6', 'Halitosis'],
  ['Z01.2', 'Examen odontológico'], ['Z29.8', 'Medidas profilácticas (profilaxis, flúor, sellantes)'], ['Z46.3', 'Prueba y ajuste de prótesis dental'], ['Z46.4', 'Prueba y ajuste de dispositivo ortodóntico'],
  ['Z97.2', 'Presencia de prótesis dental'], ['Z96.5', 'Presencia de implantes dentales'], ['Z41.8', 'Procedimiento estético (blanqueamiento dental)']
].map(([code, name]) => ({ code, name }));

export function searchCIE(q, max = 12) {
  const t = normalize(q).trim();
  if (!t) return [];
  const words = t.split(/\s+/);
  return CIE10.filter((d) => { const h = normalize(`${d.code} ${d.name}`); return words.every((w) => h.includes(w)); })
    .sort((a, b) => (normalize(a.code).startsWith(t) ? -1 : 0) - (normalize(b.code).startsWith(t) ? -1 : 0))
    .slice(0, max);
}

// ======================================================================
// VADEMÉCUM ODONTOLÓGICO: posología sugerida para adultos
// ======================================================================
const M = (name, presentation, dose, frequency, duration, route = 'Oral', family = '', note = '') => ({ name, presentation, dose, frequency, duration, route, family, note });
export const MEDS = [
  M('Amoxicilina', 'Cápsulas 500 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral', 'penicilina'),
  M('Amoxicilina', 'Tabletas 875 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'penicilina'),
  M('Amoxicilina + ácido clavulánico', 'Tabletas 875/125 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'penicilina', 'Tomar con comida'),
  M('Amoxicilina + ácido clavulánico', 'Tabletas 500/125 mg', '1 tableta', 'cada 8 horas', '7 días', 'Oral', 'penicilina', 'Tomar con comida'),
  M('Amoxicilina', 'Suspensión 250 mg/5 ml', '5 ml', 'cada 8 horas', '7 días', 'Oral', 'penicilina', 'Dosis pediátrica: ajustar a 50 mg/kg/día'),
  M('Amoxicilina (profilaxis antibiótica)', 'Cápsulas 500 mg', '4 cápsulas (2 g)', 'dosis única 1 hora antes del procedimiento', '1 día', 'Oral', 'penicilina'),
  M('Clindamicina', 'Cápsulas 300 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral', 'lincosamida', 'Alternativa en alérgicos a la penicilina'),
  M('Clindamicina (profilaxis antibiótica)', 'Cápsulas 300 mg', '2 cápsulas (600 mg)', 'dosis única 1 hora antes del procedimiento', '1 día', 'Oral', 'lincosamida'),
  M('Azitromicina', 'Tabletas 500 mg', '1 tableta', 'una vez al día', '3 días', 'Oral', 'macrolido'),
  M('Claritromicina', 'Tabletas 500 mg', '1 tableta', 'cada 12 horas', '7 días', 'Oral', 'macrolido'),
  M('Metronidazol', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas', '7 días', 'Oral', 'nitroimidazol', 'No ingerir alcohol durante el tratamiento'),
  M('Espiramicina + metronidazol', 'Tabletas 1,5 MUI/250 mg', '2 tabletas', 'cada 12 horas', '7 días', 'Oral', 'macrolido', 'No ingerir alcohol'),
  M('Cefalexina', 'Cápsulas 500 mg', '1 cápsula', 'cada 8 horas', '7 días', 'Oral', 'cefalosporina'),
  M('Cefadroxilo', 'Cápsulas 500 mg', '1 cápsula', 'cada 12 horas', '7 días', 'Oral', 'cefalosporina'),
  M('Doxiciclina', 'Tabletas 100 mg', '1 tableta', 'cada 12 horas', '14 días', 'Oral', 'tetraciclina', 'No en embarazo ni menores de 8 años'),
  M('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas con comida', '3 días', 'Oral', 'aines'),
  M('Ibuprofeno', 'Tabletas 600 mg', '1 tableta', 'cada 8 horas con comida', '3 días', 'Oral', 'aines'),
  M('Ibuprofeno', 'Suspensión 100 mg/5 ml', '5 ml', 'cada 8 horas', '3 días', 'Oral', 'aines', 'Dosis pediátrica: 10 mg/kg por toma'),
  M('Ketorolaco', 'Tabletas 10 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral', 'aines', 'No exceder 5 días'),
  M('Ketorolaco', 'Tabletas sublinguales 30 mg', '1 tableta', 'cada 8 horas si hay dolor', '2 días', 'Sublingual', 'aines'),
  M('Diclofenac potásico', 'Tabletas 50 mg', '1 tableta', 'cada 8 horas con comida', '3 días', 'Oral', 'aines'),
  M('Nimesulida', 'Tabletas 100 mg', '1 tableta', 'cada 12 horas con comida', '3 días', 'Oral', 'aines'),
  M('Naproxeno sódico', 'Tabletas 550 mg', '1 tableta', 'cada 12 horas con comida', '3 días', 'Oral', 'aines'),
  M('Ketoprofeno', 'Cápsulas 100 mg', '1 cápsula', 'cada 12 horas', '3 días', 'Oral', 'aines'),
  M('Etoricoxib', 'Tabletas 90 mg', '1 tableta', 'una vez al día', '3 días', 'Oral', 'coxib'),
  M('Celecoxib', 'Cápsulas 200 mg', '1 cápsula', 'cada 12 horas', '3 días', 'Oral', 'coxib'),
  M('Acetaminofén', 'Tabletas 500 mg', '1 tableta', 'cada 6 horas si hay dolor', '3 días', 'Oral'),
  M('Acetaminofén', 'Tabletas 650 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral'),
  M('Acetaminofén', 'Jarabe 160 mg/5 ml', '5 ml', 'cada 6 horas si hay dolor', '3 días', 'Oral', '', 'Dosis pediátrica: 15 mg/kg por toma'),
  M('Tramadol + acetaminofén', 'Tabletas 37,5/325 mg', '1 tableta', 'cada 8 horas si hay dolor intenso', '3 días', 'Oral', 'opioide', 'Puede causar somnolencia: no conducir'),
  M('Tramadol', 'Cápsulas 50 mg', '1 cápsula', 'cada 8 horas si hay dolor intenso', '3 días', 'Oral', 'opioide', 'Puede causar somnolencia: no conducir'),
  M('Dipirona (metamizol)', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas si hay dolor', '3 días', 'Oral', 'dipirona'),
  M('Dexametasona', 'Tabletas 4 mg', '1 tableta', 'cada 12 horas', '2 días', 'Oral', 'corticoide', 'Para el edema postoperatorio'),
  M('Dexametasona', 'Ampolla 8 mg/2 ml', '1 ampolla', 'dosis única', '1 día', 'Intramuscular', 'corticoide'),
  M('Betametasona', 'Ampolla 4 mg/1 ml', '1 ampolla', 'dosis única', '1 día', 'Intramuscular', 'corticoide'),
  M('Prednisona', 'Tabletas 20 mg', '1 tableta', 'una vez al día en la mañana', '3 días', 'Oral', 'corticoide'),
  M('Clorhexidina 0,12 %', 'Enjuague bucal 250 ml', '15 ml (una tapa)', 'cada 12 horas', '14 días', 'Enjuague bucal', 'clorhexidina', 'Enjuagar 30 segundos sin diluir y no tragar. No comer ni beber en 30 minutos'),
  M('Clorhexidina 0,2 % gel', 'Gel bucal 30 g', 'Aplicar en la zona', 'cada 12 horas', '7 días', 'Tópica bucal', 'clorhexidina'),
  M('Bencidamina', 'Enjuague bucal 0,15 %', '15 ml', 'cada 8 horas', '7 días', 'Enjuague bucal', '', 'Enjuagar y escupir'),
  M('Triamcinolona en orabase 0,1 %', 'Pasta bucal 5 g', 'Aplicar una capa fina sobre la lesión', 'cada 8 horas', '7 días', 'Tópica bucal', 'corticoide', 'Para aftas y úlceras'),
  M('Ácido hialurónico gel bucal', 'Gel 0,2 %', 'Aplicar en la zona', 'cada 8 horas', '7 días', 'Tópica bucal'),
  M('Benzocaína 20 % gel', 'Gel tópico', 'Aplicar en la zona dolorosa', 'cada 6 horas si hay dolor', '3 días', 'Tópica bucal', 'anestesico'),
  M('Lidocaína viscosa 2 %', 'Solución 100 ml', '5 ml para enjuagar', 'antes de cada comida', '5 días', 'Enjuague bucal', 'anestesico', 'Enjuagar y escupir'),
  M('Nistatina', 'Suspensión 100.000 UI/ml', '5 ml', 'cada 6 horas', '14 días', 'Enjuague bucal', '', 'Enjuagar 1 minuto y tragar'),
  M('Miconazol gel oral 2 %', 'Gel 40 g', 'Aplicar media cucharadita', 'cada 6 horas', '14 días', 'Tópica bucal'),
  M('Fluconazol', 'Cápsulas 150 mg', '1 cápsula', 'una vez a la semana', '2 semanas', 'Oral'),
  M('Aciclovir', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '5 días', 'Oral'),
  M('Aciclovir crema 5 %', 'Crema 5 g', 'Aplicar en la lesión', 'cada 4 horas', '5 días', 'Tópica'),
  M('Fluoruro de sodio 5.000 ppm', 'Pasta dental 51 g', 'Cepillado', 'en la noche antes de dormir', '30 días', 'Tópica bucal', '', 'No enjuagar después del cepillado'),
  M('Nitrato de potasio 5 %', 'Pasta dental para sensibilidad', 'Cepillado', 'cada 12 horas', '30 días', 'Tópica bucal'),
  M('Ácido tranexámico', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas', '3 días', 'Oral', '', 'Para control de sangrado postextracción'),
  M('Ácido tranexámico (enjuague)', 'Ampolla 500 mg/5 ml', '1 ampolla en 10 ml de agua', 'enjuagar cada 6 horas', '2 días', 'Enjuague bucal'),
  M('Omeprazol', 'Cápsulas 20 mg', '1 cápsula', 'en ayunas', '5 días', 'Oral', '', 'Protector gástrico mientras toma antiinflamatorios'),
  M('Loratadina', 'Tabletas 10 mg', '1 tableta', 'una vez al día', '5 días', 'Oral'),
  M('Diazepam', 'Tabletas 5 mg', '1 tableta', '1 hora antes de la cita', '1 día', 'Oral', 'benzodiacepina', 'Venir acompañado. No conducir'),
  M('Alprazolam', 'Tabletas 0,25 mg', '1 tableta', 'la noche anterior y 1 hora antes de la cita', '1 día', 'Oral', 'benzodiacepina', 'Venir acompañado. No conducir')
];
MEDS.forEach((m, i) => { m.id = 'm' + i; });

export const ROUTES_ADMIN = ['Oral', 'Sublingual', 'Enjuague bucal', 'Tópica bucal', 'Tópica', 'Intramuscular', 'Intravenosa'];
export const FREQUENCIES = ['cada 4 horas', 'cada 6 horas', 'cada 8 horas', 'cada 12 horas', 'una vez al día', 'en la noche', 'en ayunas', 'después de cada comida', 'dosis única', 'dosis única 1 hora antes del procedimiento', 'si hay dolor'];
export const DURATIONS = ['1 día', '2 días', '3 días', '5 días', '7 días', '10 días', '14 días', '30 días', 'Continuo'];

export function searchMeds(q, max = 14, favs = []) {
  const t = normalize(q).trim();
  const all = [...favs.map((f) => ({ ...f, fav: true })), ...MEDS];
  if (!t) return favs.length ? all.slice(0, max) : [];
  const words = t.split(/\s+/);
  const seen = new Set();
  return all.filter((m) => {
    const key = normalize(`${m.name} ${m.presentation}`);
    if (seen.has(key)) return false;
    const ok = words.every((w) => key.includes(w));
    if (ok) seen.add(key);
    return ok;
  }).slice(0, max);
}

// ======================================================================
// ALERGIAS: un medicamento o anestésico de una familia a la que el paciente es alérgico
// ======================================================================
const ALLERGY_FAMILIES = {
  penicilina: ['penicilina', 'amoxicilina', 'ampicilina', 'dicloxacilina', 'oxacilina', 'clavulan'],
  cefalosporina: ['cefalosporina', 'cefalexina', 'cefadroxilo', 'cefuroxima', 'ceftriaxona', 'cefixima', 'cefazolina'],
  sulfa: ['sulfa', 'sulfametoxazol', 'celecoxib'],
  aines: ['aines', 'ibuprofeno', 'diclofenac', 'naproxeno', 'ketoprofeno', 'ketorolaco', 'meloxicam', 'piroxicam', 'aspirina', 'acetilsalicilico', 'nimesulida'],
  aspirina: ['aspirina', 'acetilsalicilico'],
  dipirona: ['dipirona', 'metamizol'],
  macrolido: ['macrolido', 'azitromicina', 'claritromicina', 'eritromicina', 'espiramicina'],
  lincosamida: ['clindamicina', 'lincomicina'],
  anestesico: ['anestesico', 'lidocaina', 'mepivacaina', 'articaina', 'prilocaina', 'bupivacaina', 'benzocaina'],
  clorhexidina: ['clorhexidina'],
  metronidazol: ['metronidazol', 'nitroimidazol'],
  tetraciclina: ['doxiciclina', 'tetraciclina', 'minociclina'],
  opioide: ['tramadol', 'codeina', 'morfina']
};
const ALLERGY_KEY = {
  penicilina: 'penicilina', penicilinas: 'penicilina', amoxicilina: 'penicilina', cefalosporinas: 'cefalosporina', cefalosporina: 'cefalosporina', sulfas: 'sulfa', sulfa: 'sulfa',
  aines: 'aines', aspirina: 'aspirina', dipirona: 'dipirona', metamizol: 'dipirona', macrolidos: 'macrolido', clindamicina: 'lincosamida',
  lidocaina: 'anestesico', anestesicos: 'anestesico', anestesia: 'anestesico', clorhexidina: 'clorhexidina', metronidazol: 'metronidazol', tetraciclinas: 'tetraciclina', tramadol: 'opioide'
};

/** Devuelve la alergia del paciente con la que choca el medicamento (o el anestésico), o null */
export function allergyConflict(med, allergies = []) {
  const name = normalize(`${med.name} ${med.family || ''}`);
  for (const a of allergies) {
    const an = normalize(a).replace(/[^a-z0-9 ]/g, ' ').trim();
    if (!an) continue;
    const fam = ALLERGY_KEY[an.split(' ')[0]] || ALLERGY_KEY[an];
    const words = fam ? ALLERGY_FAMILIES[fam] : [an];
    if (words.some((w) => w.length > 3 && name.includes(w))) return a;
    if (fam && med.family === fam) return a;
  }
  return null;
}

// ======================================================================
// ANESTESIA LOCAL: dosis máxima por peso (cartucho de 1,8 ml)
// ======================================================================
export const ANESTHETICS = [
  { k: 'lido_epi', name: 'Lidocaína 2 % con epinefrina 1:80.000', mg: 36, mgKg: 7, max: 500, vaso: true },
  { k: 'lido_epi100', name: 'Lidocaína 2 % con epinefrina 1:100.000', mg: 36, mgKg: 7, max: 500, vaso: true },
  { k: 'mepi3', name: 'Mepivacaína 3 % sin vasoconstrictor', mg: 54, mgKg: 6.6, max: 400, vaso: false },
  { k: 'mepi2', name: 'Mepivacaína 2 % con epinefrina 1:100.000', mg: 36, mgKg: 6.6, max: 400, vaso: true },
  { k: 'arti', name: 'Articaína 4 % con epinefrina 1:100.000', mg: 72, mgKg: 7, max: 500, vaso: true },
  { k: 'arti200', name: 'Articaína 4 % con epinefrina 1:200.000', mg: 72, mgKg: 7, max: 500, vaso: true },
  { k: 'prilo', name: 'Prilocaína 3 % con felipresina', mg: 54, mgKg: 8, max: 600, vaso: true },
  { k: 'bupi', name: 'Bupivacaína 0,5 % con epinefrina 1:200.000', mg: 9, mgKg: 1.3, max: 90, vaso: true }
];
export const TECHNIQUES = ['Infiltrativa (supraperióstica)', 'Troncular del dentario inferior', 'Mentoniana', 'Infraorbitaria', 'Alveolar superior posterior (tuberositaria)', 'Nasopalatina', 'Palatina mayor', 'Bucal (largo)', 'Intraligamentaria', 'Tópica'];
/** Cartuchos máximos según el peso del paciente (si no hay peso se asume 70 kg) */
export function maxCartridges(anestheticKey, weightKg) {
  const a = ANESTHETICS.find((x) => x.k === anestheticKey);
  if (!a) return null;
  const w = parseFloat(String(weightKg || '').replace(',', '.')) || 70;
  const mg = Math.min(a.max, a.mgKg * w);
  return Math.floor((mg / a.mg) * 10) / 10;
}

// ======================================================================
// ANTECEDENTES MÉDICOS CON IMPLICACIÓN ODONTOLÓGICA (alertas en la atención)
// ======================================================================
export const MEDICAL_ALERTS = {
  'Hipertensión arterial': ['warning', 'Tomar la TA antes de anestesiar. Vasoconstrictor con precaución (máx. 2 cartuchos con epinefrina si no está controlada).'],
  'Diabetes': ['warning', 'Verificar glicemia y que haya comido. Cicatrización lenta y mayor riesgo de infección.'],
  'Cardiopatía': ['warning', 'Limitar vasoconstrictor. Citas cortas en la mañana y control del estrés.'],
  'Endocarditis previa / prótesis valvular': ['danger', 'Requiere PROFILAXIS ANTIBIÓTICA antes de procedimientos que hagan sangrar (amoxicilina 2 g o clindamicina 600 mg 1 h antes).'],
  'Marcapasos': ['warning', 'Evitar bisturí eléctrico y ultrasonido magnetostrictivo.'],
  'Anticoagulado (warfarina, rivaroxabán…)': ['danger', 'Riesgo de sangrado: solicitar INR reciente (< 3,5) antes de cirugías; hemostasia local con ácido tranexámico.'],
  'Antiagregante (aspirina, clopidogrel)': ['warning', 'Mayor sangrado: hemostasia local cuidadosa. No suspender sin indicación del cardiólogo.'],
  'Trastorno de la coagulación / hemofilia': ['danger', 'Coordinar con hematología antes de cualquier procedimiento cruento.'],
  'Bifosfonatos / denosumab': ['danger', 'Riesgo de OSTEONECROSIS de los maxilares en extracciones, implantes y cirugías.'],
  'Radioterapia de cabeza y cuello': ['danger', 'Riesgo de osteorradionecrosis: evitar extracciones sin protocolo.'],
  'Quimioterapia': ['warning', 'Verificar hematología (neutrófilos y plaquetas) antes de procedimientos invasivos.'],
  'Embarazo': ['warning', 'Preferir el 2.º trimestre. Rx solo si es imprescindible y con delantal plomado. Evitar AINES en el 3.er trimestre.'],
  'Lactancia': ['info', 'Elegir fármacos compatibles con la lactancia.'],
  'Asma': ['warning', 'Tener a mano su inhalador. Evitar AINES si es sensible a la aspirina.'],
  'Epilepsia': ['warning', 'Preguntar por la última crisis. Atención con la luz del equipo y el estrés.'],
  'Hepatitis': ['warning', 'Ajustar fármacos de metabolismo hepático. Bioseguridad estricta.'],
  'VIH': ['info', 'Bioseguridad estándar. Valorar conteo de CD4 en cirugías.'],
  'Enfermedad renal crónica': ['warning', 'Ajustar dosis de antibióticos y evitar AINES.'],
  'Hipotiroidismo / hipertiroidismo': ['info', 'En hipertiroidismo no controlado evitar epinefrina.'],
  'Osteoporosis': ['info', 'Preguntar si recibe bifosfonatos.'],
  'Fumador': ['info', 'Mayor riesgo de enfermedad periodontal, alveolitis y fracaso de implantes.'],
  'Ansiedad / fobia dental': ['info', 'Explicar cada paso, citas cortas; valorar premedicación ansiolítica.'],
  'Bruxismo': ['info', 'Valorar placa miorrelajante; desgaste y fracturas.']
};
export const MEDICAL_TAGS = Object.keys(MEDICAL_ALERTS);
/** Alertas para el odontólogo según los antecedentes y alergias del paciente */
export function medicalAlerts(chronic = [], allergies = []) {
  const out = (chronic || []).filter((t) => MEDICAL_ALERTS[t]).map((t) => ({ tag: t, tone: MEDICAL_ALERTS[t][0], text: MEDICAL_ALERTS[t][1] }));
  if ((allergies || []).some((a) => /anest|lidoca|artica|mepiva/i.test(a))) out.unshift({ tag: 'Alergia a anestésicos', tone: 'danger', text: 'Alérgico a anestésicos locales: no anestesiar sin prueba alergológica.' });
  if ((allergies || []).some((a) => /l[aá]tex/i.test(a))) out.unshift({ tag: 'Alergia al látex', tone: 'danger', text: 'Usar guantes y dique de nitrilo, sin látex.' });
  return out.sort((a, b) => (a.tone === 'danger' ? -1 : 0) - (b.tone === 'danger' ? -1 : 0));
}

// ======================================================================
// RADIOGRAFÍAS, ESTUDIOS Y REFERENCIAS
// ======================================================================
export const IMAGING = ['Radiografía periapical', 'Radiografía coronal (bite-wing)', 'Radiografía oclusal', 'Serie periapical completa', 'Radiografía panorámica', 'Cefálica lateral (cefalometría)', 'Radiografía de ATM', 'Tomografía cone beam (CBCT)', 'Fotografías intra y extraorales', 'Modelos de estudio', 'Escaneo intraoral 3D'];
export const LAB_GROUPS = {
  'Prequirúrgicos': ['Hematología completa', 'Tiempo de protrombina (PT)', 'Tiempo parcial de tromboplastina (PTT)', 'INR', 'Plaquetas', 'Glicemia en ayunas', 'Hemoglobina glicosilada (HbA1c)'],
  'Infecciosas': ['VIH (prueba rápida / ELISA)', 'Hepatitis B (HBsAg)', 'Hepatitis C (anti-HCV)', 'VDRL'],
  'Otros': ['Biopsia (estudio histopatológico)', 'Cultivo y antibiograma de exudado', 'Electrocardiograma', 'Valoración cardiovascular']
};
export const SPECIALTIES = ['Endodoncia', 'Periodoncia', 'Cirugía bucal y maxilofacial', 'Ortodoncia', 'Odontopediatría', 'Rehabilitación oral / prótesis', 'Implantología', 'Estética dental', 'Estomatología / patología bucal', 'ATM y dolor orofacial', 'Radiología bucal', 'Medicina interna', 'Cardiología', 'Hematología', 'Otorrinolaringología'];
export const DENTAL_SPECIALTIES = ['Odontología general', 'Endodoncia', 'Periodoncia', 'Ortodoncia', 'Odontopediatría', 'Cirugía bucal y maxilofacial', 'Rehabilitación oral', 'Implantología', 'Estética dental', 'Higienista dental'];

// ======================================================================
// SIGNOS VITALES (antes de anestesiar)
// ======================================================================
export const VITALS = [
  ['ta', 'Tensión arterial', 'mmHg', '120/80'], ['fc', 'Pulso', 'lpm', '72'], ['temp', 'Temperatura', '°C', '36,5'],
  ['sat', 'Saturación O₂', '%', '98'], ['glucemia', 'Glicemia capilar', 'mg/dl', '95'], ['peso', 'Peso', 'kg', '70']
];
export function parseTA(v) {
  const m = String(v || '').match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
  return m ? { s: +m[1], d: +m[2] } : null;
}
const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : null; };
export function taClass(v) {
  const t = parseTA(v);
  if (!t) return null;
  if (t.s >= 180 || t.d >= 110) return { label: 'Crisis: diferir el tratamiento', tone: 'danger' };
  if (t.s >= 160 || t.d >= 100) return { label: 'HTA grado 2', tone: 'danger' };
  if (t.s >= 140 || t.d >= 90) return { label: 'HTA grado 1', tone: 'warning' };
  if (t.s >= 130 || t.d >= 85) return { label: 'Elevada', tone: 'warning' };
  if (t.s < 90 || t.d < 60) return { label: 'Hipotensión', tone: 'warning' };
  return { label: 'Normal', tone: 'success' };
}
/** Alertas por valores fuera de rango que condicionan la atención odontológica */
export function vitalAlerts(v = {}) {
  const out = [];
  const ta = taClass(v.ta); if (ta && ta.tone !== 'success') out.push({ k: 'ta', text: `TA ${v.ta}: ${ta.label}`, tone: ta.tone });
  const fc = n(v.fc); if (fc != null) { if (fc > 100) out.push({ k: 'fc', text: `Taquicardia (${fc} lpm)`, tone: 'warning' }); if (fc < 50) out.push({ k: 'fc', text: `Bradicardia (${fc} lpm)`, tone: 'warning' }); }
  const t = n(v.temp); if (t != null && t >= 37.8) out.push({ k: 'temp', text: `Fiebre (${t} °C): posible proceso infeccioso`, tone: 'warning' });
  const s = n(v.sat); if (s != null && s < 94) out.push({ k: 'sat', text: `Saturación baja (${s}%)`, tone: s < 90 ? 'danger' : 'warning' });
  const g = n(v.glucemia); if (g != null) { if (g < 70) out.push({ k: 'glucemia', text: `Hipoglicemia (${g} mg/dl): dar azúcar antes de atender`, tone: 'danger' }); else if (g >= 250) out.push({ k: 'glucemia', text: `Hiperglicemia severa (${g} mg/dl): diferir cirugías`, tone: 'danger' }); else if (g >= 180) out.push({ k: 'glucemia', text: `Hiperglicemia (${g} mg/dl)`, tone: 'warning' }); }
  return out;
}

// ======================================================================
// EDAD Y DENTICIÓN
// ======================================================================
export function ageOf(birthDate, at = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T12:00');
  if (isNaN(b)) return null;
  let a = at.getFullYear() - b.getFullYear();
  const mm = at.getMonth() - b.getMonth();
  if (mm < 0 || (mm === 0 && at.getDate() < b.getDate())) a--;
  return a;
}
export function ageText(birthDate, at = new Date()) {
  if (!birthDate) return '';
  const b = new Date(birthDate + 'T12:00');
  if (isNaN(b)) return '';
  const months = (at.getFullYear() - b.getFullYear()) * 12 + at.getMonth() - b.getMonth() - (at.getDate() < b.getDate() ? 1 : 0);
  if (months < 1) return `${Math.max(0, Math.floor((at - b) / 864e5))} días`;
  if (months < 24) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `${Math.floor(months / 12)} años`;
}
/** Dentición sugerida por edad: temporal (< 6), mixta (6–12), permanente */
export function dentitionFor(birthDate) {
  const a = ageOf(birthDate);
  if (a == null) return 'permanente';
  return a < 6 ? 'temporal' : a < 12 ? 'mixta' : 'permanente';
}

// ======================================================================
// EXAMEN CLÍNICO
// ======================================================================
export const EXTRAORAL_TEMPLATE = 'Cara simétrica, sin aumento de volumen. Ganglios no palpables. ATM: apertura normal (± 45 mm), sin ruidos ni dolor. Labios hidratados, sin lesiones.';
export const INTRAORAL_TEMPLATE = 'Mucosa bucal rosada, hidratada, sin lesiones. Lengua y piso de boca normales. Paladar sin alteraciones. Encía rosada, firme, con puntillado. Frenillos normales.';
export const HYGIENE = ['Buena', 'Regular', 'Deficiente'];
export const OCCLUSION = ['Clase I', 'Clase II división 1', 'Clase II división 2', 'Clase III', 'Mordida abierta', 'Mordida cruzada', 'Mordida profunda', 'Edéntulo'];

// ======================================================================
// INDICACIONES POSTOPERATORIAS FRECUENTES
// ======================================================================
export const POSTOP = {
  'Exodoncia': ['Morder la gasa con firmeza durante 30 a 40 minutos.', 'No escupir, no enjuagarse ni usar pitillo durante 24 horas.', 'Aplicar hielo en la cara 20 minutos cada hora el primer día.', 'Dieta blanda y fría las primeras 24 a 48 horas; masticar del otro lado.', 'No fumar ni ingerir alcohol durante 72 horas.', 'Dormir con la cabeza elevada la primera noche.', 'Desde el segundo día, enjuagues suaves con agua tibia y sal 3 veces al día.', 'Si el sangrado no cede, morder una gasa húmeda 30 minutos y llamar al consultorio.'],
  'Endodoncia': ['Es normal sentir molestia al morder durante 2 o 3 días.', 'No masticar alimentos duros con ese diente hasta colocar la restauración definitiva.', 'Si se cae la restauración provisional, llamar al consultorio.'],
  'Resinas': ['Puede comer normalmente al salir del consultorio.', 'Sensibilidad leve al frío los primeros días es normal.', 'Evitar morder objetos duros (lapiceros, uñas, hielo).'],
  'Limpieza': ['Puede sentir sensibilidad leve las primeras 24 horas.', 'Mantener el cepillado 3 veces al día y el hilo dental cada noche.'],
  'Blanqueamiento': ['Durante 48 horas: dieta blanca (evitar café, té, vino, refrescos oscuros, salsas y tabaco).', 'La sensibilidad es temporal; usar la pasta para dientes sensibles indicada.'],
  'Ortodoncia': ['Cepillarse después de cada comida con cepillo de ortodoncia y cepillos interdentales.', 'Evitar alimentos duros y pegajosos (caramelos, maní, hielo, chicle).', 'Usar cera de ortodoncia en los brackets que lastimen.', 'Asistir puntualmente a los controles mensuales.'],
  'Prótesis': ['Retirar la prótesis para dormir y dejarla en un vaso con agua.', 'Limpiar la prótesis después de cada comida con cepillo y jabón neutro.', 'Si lastima, no dejar de usarla: acudir al consultorio para el ajuste.'],
  'Implante': ['Aplicar hielo las primeras 24 horas y dieta blanda por 7 días.', 'No fumar: el tabaco puede hacer fracasar el implante.', 'Enjuague de clorhexidina desde el día siguiente según indicación.'],
  'Higiene': ['Cepillado 3 veces al día durante 2 minutos con pasta fluorada.', 'Usar hilo dental todas las noches.', 'Cambiar el cepillo cada 3 meses.', 'Reducir azúcares y bebidas ácidas entre comidas.', 'Control y limpieza cada 6 meses.']
};

// ======================================================================
// ARANCEL DE PROCEDIMIENTOS (precios en $ editables en Configuración)
// unit: diente | superficie | boca | arcada | cuadrante | sesion
// effect: cómo cambia el odontograma al realizarlo
//   { s: 'resina', surf? }   → marca las superficies del diente
//   { t: 'endodoncia', rm }  → marca el diente y quita las condiciones rm ('*' = también las superficies)
// ======================================================================
const P = (code, name, cat, price, unit = 'diente', effect = null) => ({ code, name, cat, price, unit, effect });
export const PROC_CATS = ['Diagnóstico', 'Prevención', 'Operatoria', 'Endodoncia', 'Periodoncia', 'Cirugía', 'Prótesis', 'Implantes', 'Ortodoncia', 'Estética', 'Odontopediatría', 'Otros'];
export const DEFAULT_PROCEDURES = [
  P('D01', 'Consulta de evaluación y diagnóstico', 'Diagnóstico', 20, 'boca'),
  P('D02', 'Consulta de control', 'Diagnóstico', 10, 'boca'),
  P('D03', 'Consulta de urgencia', 'Diagnóstico', 25, 'boca'),
  P('D04', 'Radiografía periapical', 'Diagnóstico', 8, 'diente'),
  P('D05', 'Radiografía coronal (bite-wing)', 'Diagnóstico', 8, 'cuadrante'),
  P('D06', 'Fotografías y modelos de estudio', 'Diagnóstico', 25, 'boca'),
  P('PV01', 'Profilaxis (limpieza dental)', 'Prevención', 30, 'boca'),
  P('PV02', 'Tartrectomía (detartraje) con ultrasonido', 'Prevención', 40, 'boca'),
  P('PV03', 'Aplicación tópica de flúor', 'Prevención', 15, 'boca'),
  P('PV04', 'Sellante de fosas y fisuras', 'Prevención', 15, 'diente', { s: 'sellante', surf: ['O'] }),
  P('PV05', 'Instrucción de higiene oral', 'Prevención', 5, 'boca'),
  P('O01', 'Restauración con resina (1 superficie)', 'Operatoria', 35, 'superficie', { s: 'resina' }),
  P('O02', 'Restauración con resina (2 superficies)', 'Operatoria', 45, 'superficie', { s: 'resina' }),
  P('O03', 'Restauración con resina (3 o más superficies)', 'Operatoria', 55, 'superficie', { s: 'resina' }),
  P('O04', 'Restauración con amalgama', 'Operatoria', 30, 'superficie', { s: 'amalgama' }),
  P('O05', 'Restauración con ionómero de vidrio', 'Operatoria', 25, 'superficie', { s: 'ionomero' }),
  P('O06', 'Restauración provisional', 'Operatoria', 15, 'diente'),
  P('O07', 'Incrustación (inlay / onlay)', 'Operatoria', 180, 'diente', { s: 'resina', surf: ['O', 'M', 'D'] }),
  P('O08', 'Reconstrucción con resina y poste de fibra', 'Operatoria', 90, 'diente', { s: 'resina', surf: ['O', 'M', 'D', 'V', 'L'] }),
  P('E01', 'Endodoncia unirradicular', 'Endodoncia', 120, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('E02', 'Endodoncia birradicular', 'Endodoncia', 160, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('E03', 'Endodoncia multirradicular', 'Endodoncia', 220, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('E04', 'Retratamiento endodóntico', 'Endodoncia', 250, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('E05', 'Apertura y drenaje (urgencia endodóntica)', 'Endodoncia', 40, 'diente'),
  P('PE01', 'Raspado y alisado radicular (por cuadrante)', 'Periodoncia', 50, 'cuadrante'),
  P('PE02', 'Cirugía periodontal a colgajo (por cuadrante)', 'Periodoncia', 150, 'cuadrante'),
  P('PE03', 'Gingivectomía / gingivoplastia (por sextante)', 'Periodoncia', 90, 'cuadrante'),
  P('PE04', 'Ferulización dental', 'Periodoncia', 60, 'arcada'),
  P('PE05', 'Mantenimiento periodontal', 'Periodoncia', 40, 'boca'),
  P('C01', 'Exodoncia simple', 'Cirugía', 35, 'diente', { t: 'ausente', rm: ['extraccion', '*'] }),
  P('C02', 'Exodoncia quirúrgica', 'Cirugía', 70, 'diente', { t: 'ausente', rm: ['extraccion', '*'] }),
  P('C03', 'Exodoncia de tercer molar (cordal)', 'Cirugía', 120, 'diente', { t: 'ausente', rm: ['extraccion', '*'] }),
  P('C04', 'Exodoncia de cordal incluido / retenido', 'Cirugía', 180, 'diente', { t: 'ausente', rm: ['extraccion', 'no_erupcionado', '*'] }),
  P('C05', 'Drenaje de absceso', 'Cirugía', 30, 'diente'),
  P('C06', 'Frenectomía', 'Cirugía', 90, 'boca'),
  P('C07', 'Biopsia', 'Cirugía', 80, 'boca'),
  P('C08', 'Alveoloplastia (por cuadrante)', 'Cirugía', 70, 'cuadrante'),
  P('PR01', 'Corona metal-porcelana', 'Prótesis', 280, 'diente', { t: 'corona', rm: ['corona_indicada'] }),
  P('PR02', 'Corona de zirconio', 'Prótesis', 380, 'diente', { t: 'corona', rm: ['corona_indicada'] }),
  P('PR03', 'Corona de disilicato de litio (e.max)', 'Prótesis', 350, 'diente', { t: 'corona', rm: ['corona_indicada'] }),
  P('PR04', 'Corona provisional', 'Prótesis', 40, 'diente'),
  P('PR05', 'Perno muñón colado', 'Prótesis', 90, 'diente'),
  P('PR06', 'Póntico de puente fijo (por unidad)', 'Prótesis', 280, 'diente', { t: 'pontico', rm: ['ausente'] }),
  P('PR07', 'Prótesis total (por arcada)', 'Prótesis', 350, 'arcada'),
  P('PR08', 'Prótesis parcial removible acrílica', 'Prótesis', 250, 'arcada'),
  P('PR09', 'Prótesis parcial removible metálica (cromo-cobalto)', 'Prótesis', 400, 'arcada'),
  P('PR10', 'Rebase de prótesis', 'Prótesis', 60, 'arcada'),
  P('PR11', 'Recementado de corona o puente', 'Prótesis', 20, 'diente'),
  P('I01', 'Implante dental (fase quirúrgica)', 'Implantes', 800, 'diente', { t: 'implante', rm: ['ausente'] }),
  P('I02', 'Corona sobre implante', 'Implantes', 450, 'diente', { t: 'corona', rm: ['corona_indicada'] }),
  P('I03', 'Injerto óseo', 'Implantes', 350, 'diente'),
  P('I04', 'Elevación de seno maxilar', 'Implantes', 600, 'cuadrante'),
  P('OR01', 'Estudio de ortodoncia (cefalometría, modelos y fotos)', 'Ortodoncia', 80, 'boca'),
  P('OR02', 'Instalación de brackets metálicos (por arcada)', 'Ortodoncia', 300, 'arcada'),
  P('OR03', 'Instalación de brackets estéticos (por arcada)', 'Ortodoncia', 450, 'arcada'),
  P('OR04', 'Control de ortodoncia mensual', 'Ortodoncia', 35, 'sesion'),
  P('OR05', 'Retenedor (por arcada)', 'Ortodoncia', 80, 'arcada'),
  P('OR06', 'Alineadores invisibles (tratamiento)', 'Ortodoncia', 1800, 'boca'),
  P('OR07', 'Aparato ortopédico removible', 'Ortodoncia', 180, 'arcada'),
  P('ES01', 'Blanqueamiento en consultorio', 'Estética', 180, 'boca'),
  P('ES02', 'Blanqueamiento ambulatorio con férulas', 'Estética', 120, 'boca'),
  P('ES03', 'Carilla de resina', 'Estética', 90, 'diente', { s: 'resina', surf: ['V'] }),
  P('ES04', 'Carilla de porcelana', 'Estética', 350, 'diente', { t: 'carilla' }),
  P('ES05', 'Contorneado estético / microabrasión', 'Estética', 40, 'diente'),
  P('OP01', 'Pulpotomía (diente temporal)', 'Odontopediatría', 45, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('OP02', 'Pulpectomía (diente temporal)', 'Odontopediatría', 60, 'diente', { t: 'endodoncia', rm: ['endo_indicada'] }),
  P('OP03', 'Exodoncia de diente temporal', 'Odontopediatría', 25, 'diente', { t: 'ausente', rm: ['extraccion', '*'] }),
  P('OP04', 'Corona de acero (diente temporal)', 'Odontopediatría', 60, 'diente', { t: 'corona', rm: ['corona_indicada'] }),
  P('OP05', 'Mantenedor de espacio', 'Odontopediatría', 90, 'diente'),
  P('X01', 'Placa miorrelajante (bruxismo)', 'Otros', 120, 'arcada'),
  P('X02', 'Protector bucal deportivo', 'Otros', 60, 'arcada'),
  P('X03', 'Ajuste oclusal', 'Otros', 30, 'boca'),
  P('X04', 'Tratamiento de sensibilidad dentinaria', 'Otros', 20, 'diente')
];
export const UNIT_LABEL = { diente: 'por diente', superficie: 'por diente (según superficies)', boca: 'boca completa', arcada: 'por arcada', cuadrante: 'por cuadrante', sesion: 'por sesión' };

// ======================================================================
// CONSENTIMIENTOS INFORMADOS
// ======================================================================
export const CONSENTS = {
  general: { title: 'Tratamiento odontológico general', proc: 'examen clínico, radiografías, limpieza, restauraciones (resinas, amalgamas) y los procedimientos indicados en mi plan de tratamiento', risks: ['Sensibilidad dental transitoria después de las restauraciones.', 'Molestias o inflamación de la encía.', 'Necesidad de tratamiento de conducto si la caries está muy cerca del nervio.', 'Reacciones a la anestesia local (adormecimiento prolongado, hematoma, mareo).', 'Fractura de restauraciones con el tiempo.'], alt: 'No realizar tratamiento, con progresión de la enfermedad.' },
  exodoncia: { title: 'Extracción dental (exodoncia)', proc: 'la extracción del (de los) diente(s) indicado(s)', risks: ['Dolor, inflamación y moretones en la cara durante algunos días.', 'Sangrado postoperatorio.', 'Infección o alveolo seco (alveolitis).', 'Fractura de la raíz o de la tabla ósea; posible necesidad de cirugía.', 'Comunicación con el seno maxilar en dientes superiores posteriores.', 'Adormecimiento temporal o, raramente, permanente del labio, mentón o lengua (dientes inferiores).', 'Limitación temporal de la apertura bucal.'], alt: 'Tratamiento de conducto u otras alternativas cuando el diente es restaurable.' },
  cordal: { title: 'Cirugía de terceros molares (cordales)', proc: 'la extracción quirúrgica de los terceros molares indicados, que puede requerir incisión, retiro de hueso, sección del diente y sutura', risks: ['Inflamación facial importante y moretones durante 3 a 7 días.', 'Dolor y limitación de la apertura bucal.', 'Infección o alveolitis.', 'Lesión del nervio dentario inferior o lingual con adormecimiento temporal o, raramente, permanente del labio, mentón o lengua.', 'Comunicación bucosinusal en cordales superiores.', 'Fractura mandibular (muy rara).'], alt: 'Control clínico y radiográfico periódico.' },
  endodoncia: { title: 'Tratamiento de conducto (endodoncia)', proc: 'la eliminación del nervio (pulpa) del diente, la limpieza y desinfección de sus conductos y su sellado', risks: ['Dolor o molestia al morder durante algunos días.', 'Fractura de instrumentos dentro del conducto.', 'Perforación de la raíz.', 'Fracaso del tratamiento con necesidad de retratamiento, cirugía apical o extracción.', 'El diente tratado es más frágil: suele requerir corona o reconstrucción.'], alt: 'Extracción del diente.' },
  implante: { title: 'Colocación de implantes dentales', proc: 'la colocación quirúrgica de implante(s) de titanio en el hueso maxilar y, luego de su integración, la prótesis sobre ellos', risks: ['Inflamación, dolor y moretones.', 'Falta de integración del implante (fracaso), que obliga a retirarlo.', 'Lesión de nervios con adormecimiento del labio o mentón.', 'Comunicación con el seno maxilar o fosas nasales.', 'Necesidad de injertos de hueso.', 'Periimplantitis si no hay buena higiene; el tabaco y la diabetes no controlada aumentan el riesgo.'], alt: 'Prótesis fija sobre dientes vecinos (puente) o prótesis removible.' },
  periodoncia: { title: 'Tratamiento periodontal', proc: 'el raspado y alisado radicular y/o la cirugía periodontal para tratar la enfermedad de las encías', risks: ['Sensibilidad dental al frío durante semanas.', 'Retracción de la encía con dientes que se ven más largos y espacios entre ellos.', 'Movilidad dental transitoria.', 'Necesidad de mantenimientos periódicos para conservar los resultados.'], alt: 'No tratar, con avance de la pérdida ósea y posible pérdida de los dientes.' },
  protesis: { title: 'Prótesis dental (coronas, puentes y prótesis removibles)', proc: 'el tallado de los dientes, la toma de impresiones, las pruebas y la colocación de la prótesis indicada', risks: ['Sensibilidad en los dientes tallados.', 'Necesidad de tratamiento de conducto en dientes tallados.', 'Periodo de adaptación al hablar y masticar.', 'Desajustes, fracturas o despegado de la prótesis con el tiempo.', 'Diferencias leves de color con los dientes naturales.'], alt: 'Otras opciones de rehabilitación explicadas por el odontólogo.' },
  ortodoncia: { title: 'Tratamiento de ortodoncia', proc: 'la colocación de aparatos (brackets, alineadores o aparatos removibles) para mover los dientes y corregir la mordida', risks: ['Molestias los primeros días y después de cada activación.', 'Manchas blancas o caries si la higiene es deficiente.', 'Reabsorción de las raíces.', 'Inflamación de las encías.', 'Recidiva (los dientes tienden a volver) si no se usan los retenedores.', 'La duración estimada puede prolongarse si no se asiste a los controles.'], alt: 'No realizar tratamiento ortodóntico.' },
  blanqueamiento: { title: 'Blanqueamiento dental', proc: 'la aplicación de un gel blanqueador (peróxido) en los dientes en el consultorio y/o en casa con férulas', risks: ['Sensibilidad dental transitoria.', 'Irritación leve de las encías.', 'El resultado varía en cada persona y no es permanente.', 'Las restauraciones, carillas y coronas no cambian de color.'], alt: 'Carillas o coronas estéticas, o no realizarlo.' },
  odontopediatria: { title: 'Atención odontológica de menores de edad', proc: 'los procedimientos odontológicos indicados en el(la) menor, incluyendo anestesia local y, si es necesario, técnicas de manejo de conducta', risks: ['Adormecimiento del labio o la mejilla después de la anestesia: vigilar que el niño no se muerda.', 'Molestias leves después del tratamiento.', 'Necesidad de nuevas citas si el niño no colabora.'], alt: 'Referencia a odontopediatra o atención bajo sedación.' }
};
