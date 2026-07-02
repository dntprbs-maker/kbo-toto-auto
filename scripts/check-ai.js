import fs from 'fs';
import { getFirebaseAccessToken } from '../api/_utils/firebase.js';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
});
process.env.FIREBASE_SERVICE_ACCOUNT = env.FIREBASE_SERVICE_ACCOUNT;

async function check() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const token = await getFirebaseAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;
  
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/ai_models`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(await res.json());
}
check();
