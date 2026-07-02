import { getFirebaseAccessToken, parseFirestoreDoc, toFirestoreFields } from '../_utils/firebase.js';

export default async function handler(req, res) {
  try {
    const { accessToken, projectId } = await getFirebaseAccessToken();
    const collectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bets`;

    if (req.method === 'GET') {
      const response = await fetch(`${collectionUrl}?pageSize=100&orderBy=date desc`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      
      const items = (data.documents || []).map(doc => {
        const id = doc.name.split('/').pop();
        return { id, ...parseFirestoreDoc(doc) };
      });
      return res.status(200).json(items);
    }

    if (req.method === 'POST') {
      const body = req.body;
      const docData = {
        date: body.date,
        type: body.type,       // e.g. 'unanimous', 'allfive', 'single'
        amount: Number(body.amount) || 0,
        odds: Number(body.odds) || 1.0,
        picks: body.picks || [], // e.g. [{ matchup: 'A vs B', pick: 'A' }]
        status: body.status || 'pending', // 'pending', 'hit', 'miss'
        createdAt: new Date().toISOString()
      };

      const response = await fetch(collectionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: toFirestoreFields(docData) })
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(200).json({ success: true, data: await response.json() });
    }

    if (req.method === 'PUT') {
      const { id, ...body } = req.body;
      const docUrl = `${collectionUrl}/${id}`;
      
      const updateData = {
        date: body.date,
        type: body.type,
        amount: Number(body.amount),
        odds: Number(body.odds),
        picks: body.picks,
        status: body.status,
        updatedAt: new Date().toISOString()
      };

      const updateMask = Object.keys(updateData).map(k => `updateMask.fieldPaths=${k}`).join('&');
      const response = await fetch(`${docUrl}?${updateMask}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: toFirestoreFields(updateData) })
      });
      
      if (!response.ok) throw new Error(await response.text());
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const docUrl = `${collectionUrl}/${id}`;
      const response = await fetch(docUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('bets API error:', error);
    res.status(500).json({ error: error.message });
  }
}
