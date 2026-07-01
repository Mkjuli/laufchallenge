export default async function handler(req, res) {
  const DB_URL = 'https://extendsclass.com/api/json-storage/bin/bbdebde';

  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch(DB_URL);
      if (!response.ok) {
        throw new Error(`Database responded with ${response.status}`);
      }
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('API GET Error:', err);
      return res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'POST') {
    try {
      const bodyPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const response = await fetch(DB_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: bodyPayload
      });
      
      if (!response.ok) {
        throw new Error(`Database responded with ${response.status}`);
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('API POST Error:', err);
      return res.status(500).json({ error: err.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
