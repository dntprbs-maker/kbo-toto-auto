import { getFirebaseAccessToken, parseFirestoreDoc, toFirestoreFields } from '../_utils/firebase.js';

export default async function handler(req, res) {
  try {
    const { accessToken, projectId } = await getFirebaseAccessToken();
    const collectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/predictions`;

    if (req.method === 'GET') {
      // Fetch predictions
      const response = await fetch(`${collectionUrl}?pageSize=100&orderBy=createdAt desc`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      
      const predictions = (data.documents || []).map(parseFirestoreDoc);
      return res.status(200).json(predictions);
    } 
    
    else if (req.method === 'POST') {
      // Create new prediction manually
      const body = req.body;
      body.createdAt = new Date().toISOString();
      body.type = 'prediction';
      
      const response = await fetch(collectionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestoreFields(body) })
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(201).json({ success: true });
    }
    
    else if (req.method === 'PUT') {
      // Update existing prediction
      const { id, ...updateData } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      
      const docUrl = `${collectionUrl}/${id}`;
      const response = await fetch(`${docUrl}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestoreFields(updateData) })
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(200).json({ success: true });
    }
    
    else if (req.method === 'DELETE') {
      // Delete prediction
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      
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
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
