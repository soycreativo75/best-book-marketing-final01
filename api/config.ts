import fs from 'fs';
import path from 'path';

export default function handler(req: any, res: any) {
  // CORS Headers para permitir peticiones desde cualquier origen en Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tmpConfig = path.join('/tmp', 'site-config.json');

  // Guardar configuración en el servidor Vercel
  if (req.method === 'POST') {
    try {
      const config = req.body;
      if (!config || typeof config !== 'object') {
        return res.status(400).json({ success: false, error: 'Configuración inválida.' });
      }

      fs.writeFileSync(tmpConfig, JSON.stringify(config, null, 2), 'utf-8');

      return res.status(200).json({
        success: true,
        source: 'vercel_serverless',
        message: 'Configuración guardada en el servidor Vercel exitosamente.',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Vercel API Save Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Leer configuración del servidor Vercel
  if (req.method === 'GET') {
    try {
      // 1. Revisar si hay configuración en /tmp
      if (fs.existsSync(tmpConfig)) {
        const data = fs.readFileSync(tmpConfig, 'utf-8');
        return res.status(200).json({
          success: true,
          source: 'vercel_tmp_storage',
          config: JSON.parse(data),
        });
      }

      // 2. Revisar si hay un archivo empaquetado en public/site-config.json
      const publicPath = path.join(process.cwd(), 'public', 'site-config.json');
      if (fs.existsSync(publicPath)) {
        const data = fs.readFileSync(publicPath, 'utf-8');
        return res.status(200).json({
          success: true,
          source: 'vercel_public_bundle',
          config: JSON.parse(data),
        });
      }

      // 3. Revisar en data/site-config.json
      const dataPath = path.join(process.cwd(), 'data', 'site-config.json');
      if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath, 'utf-8');
        return res.status(200).json({
          success: true,
          source: 'vercel_data_bundle',
          config: JSON.parse(data),
        });
      }

      return res.status(200).json({
        success: true,
        source: 'default_clean',
        config: null,
      });
    } catch (err: any) {
      console.error('Vercel API Get Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
