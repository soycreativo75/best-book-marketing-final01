import fs from 'fs';
import path from 'path';

// Configuración para Vercel Serverless Functions: permitir hasta 15mb de payload (para imágenes y portadas)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

// Caché en memoria global para retener datos entre ejecuciones en instancias cálidas de Vercel
let memoryCache: any = (global as any).__bbm_site_config || null;

export default function handler(req: any, res: any) {
  // CORS universal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tmpConfig = path.join('/tmp', 'site-config.json');
  const publicConfig = path.join(process.cwd(), 'public', 'site-config.json');
  const dataConfig = path.join(process.cwd(), 'data', 'site-config.json');

  // Guardar configuración en el servidor Vercel
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ success: false, error: 'Configuración inválida.' });
      }

      // 1. Guardar en memoria global
      (global as any).__bbm_site_config = payload;
      memoryCache = payload;

      const jsonStr = JSON.stringify(payload, null, 2);

      // 2. Guardar en /tmp de Vercel
      try {
        fs.writeFileSync(tmpConfig, jsonStr, 'utf-8');
      } catch (tmpErr) {
        console.warn('No se pudo escribir en /tmp:', tmpErr);
      }

      // 3. Intentar guardar en disco persistente (si existe acceso de escritura como en Node / VPS / Dev)
      try {
        if (fs.existsSync(path.dirname(dataConfig))) {
          fs.writeFileSync(dataConfig, jsonStr, 'utf-8');
        }
        if (fs.existsSync(path.dirname(publicConfig))) {
          fs.writeFileSync(publicConfig, jsonStr, 'utf-8');
        }
      } catch (diskErr) {
        // En Vercel Serverless el sistema de archivos raíz es de solo lectura excepto /tmp
      }

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
      // 1. Revisar memoria global de la instancia
      if ((global as any).__bbm_site_config) {
        return res.status(200).json({
          success: true,
          source: 'vercel_memory_cache',
          config: (global as any).__bbm_site_config,
        });
      }

      // 2. Revisar si hay configuración en /tmp
      if (fs.existsSync(tmpConfig)) {
        const data = fs.readFileSync(tmpConfig, 'utf-8');
        const parsed = JSON.parse(data);
        (global as any).__bbm_site_config = parsed;
        return res.status(200).json({
          success: true,
          source: 'vercel_tmp_storage',
          config: parsed,
        });
      }

      // 3. Revisar si hay un archivo empaquetado en public/site-config.json
      if (fs.existsSync(publicConfig)) {
        const data = fs.readFileSync(publicConfig, 'utf-8');
        const parsed = JSON.parse(data);
        (global as any).__bbm_site_config = parsed;
        return res.status(200).json({
          success: true,
          source: 'vercel_public_bundle',
          config: parsed,
        });
      }

      // 4. Revisar en data/site-config.json
      if (fs.existsSync(dataConfig)) {
        const data = fs.readFileSync(dataConfig, 'utf-8');
        const parsed = JSON.parse(data);
        (global as any).__bbm_site_config = parsed;
        return res.status(200).json({
          success: true,
          source: 'vercel_data_bundle',
          config: parsed,
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
