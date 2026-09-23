import fs from 'fs';
import path from 'path';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tmpLeads = path.join('/tmp', 'leads.json');

  if (req.method === 'POST') {
    try {
      const newLead = req.body;
      let leads: any[] = [];
      if (fs.existsSync(tmpLeads)) {
        try {
          leads = JSON.parse(fs.readFileSync(tmpLeads, 'utf-8'));
        } catch {}
      }
      leads.unshift(newLead);
      fs.writeFileSync(tmpLeads, JSON.stringify(leads, null, 2), 'utf-8');
      return res.status(200).json({ success: true, message: 'Lead guardado en Vercel Serverless' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      if (fs.existsSync(tmpLeads)) {
        const data = fs.readFileSync(tmpLeads, 'utf-8');
        return res.status(200).json({ success: true, leads: JSON.parse(data) });
      }
      return res.status(200).json({ success: true, leads: [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
