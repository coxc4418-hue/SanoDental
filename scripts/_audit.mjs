import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, getDocs, collection } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
const acc = JSON.parse(readFileSync('./.accounts.json', 'utf8'));
const app = initializeApp({ apiKey: 'AIzaSyDsoh887DvejhJRDUwNGGA8dxxG4Ru1juw', authDomain: 'sano-dental.firebaseapp.com', projectId: 'sano-dental', appId: '1:8442780228:web:33c1a3ef2cd50d37e3fa11' });
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
await signInWithEmailAndPassword(getAuth(app), acc.admin.email, acc.admin.password);
const uid = acc.sede01.uid;
const CUT = '2026-10-30T00:00:00Z';
for (const n of ['patients', 'appointments', 'sales', 'consultations', 'plans', 'lab_orders', 'perio', 'products', 'cash_shifts', 'cash_movements']) {
  const docs = (await getDocs(collection(db, 'tenants', uid, n))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const own = docs.filter((d) => d.by !== 'importacion' && !d.id.startsWith('cli_'));
  const touched = docs.filter((d) => (d.by === 'importacion' || d.id.startsWith('cli_')) && (d.updatedAt || '') > CUT);
  console.log(n.padEnd(15), 'total', docs.length, '· propios', own.length, '· importados modificados', touched.length);
  for (const d of own.slice(0, 6)) console.log('    +', d.id, d.name || d.patientName || d.title || d.number || '', d.createdAt || d.date || '');
  for (const d of touched.slice(0, 6)) console.log('    ~', d.id, d.name || d.patientName || d.number || '', d.updatedAt);
}
const s = (await getDocs(collection(db, 'tenants', uid, 'config'))).docs.map((d) => [d.id, d.data()]);
for (const [id, d] of s) if (id === 'settings') console.log('settings: negocio', d.businessName, '· odontólogos', (d.doctors || []).map((x) => x.name), '· tel', d.phone, '· actualizado', d.updatedAt);
process.exit(0);
