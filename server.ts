import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Directorios de persistencia del servidor
const DATA_DIR = path.resolve(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'site-config.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const PUBLIC_CONFIG_FILE = path.join(PUBLIC_DIR, 'site-config.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// Crear carpetas necesarias si no existen
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function startServer() {
  const app = express();

  // Soporte para JSON de gran tamaño (útil para portadas en base64 e imágenes)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Middleware universal de CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Servir archivos multimedia subidos estáticamente
  app.use('/uploads', express.static(UPLOADS_DIR));

  // ==========================================
  // RUTAS DE LA API DEL SERVIDOR (/api/*)
  // ==========================================

  // 1. Estado de salud y conectividad del servidor
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      server: 'express-fullstack',
      platform: isProd ? 'production' : 'development',
      persistence: 'server-disk',
      timestamp: new Date().toISOString(),
      hasServerConfig: fs.existsSync(CONFIG_FILE),
    });
  });

  // 2. Obtener la configuración guardada en el servidor
  app.get('/api/config', (req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const fileData = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return res.json({
          success: true,
          source: 'server_disk',
          timestamp: fs.statSync(CONFIG_FILE).mtime.toISOString(),
          config: JSON.parse(fileData),
        });
      }

      if (fs.existsSync(PUBLIC_CONFIG_FILE)) {
        const fileData = fs.readFileSync(PUBLIC_CONFIG_FILE, 'utf-8');
        return res.json({
          success: true,
          source: 'public_disk',
          timestamp: fs.statSync(PUBLIC_CONFIG_FILE).mtime.toISOString(),
          config: JSON.parse(fileData),
        });
      }

      return res.json({
        success: true,
        source: 'default_fallback',
        config: null,
      });
    } catch (err: any) {
      console.error('[API Config Error] Reading config:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Guardar la configuración en el servidor de forma persistente
  app.post('/api/config', (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ success: false, error: 'Cuerpo de configuración inválido.' });
      }

      const jsonStr = JSON.stringify(payload, null, 2);

      // Guardar en /data/site-config.json
      fs.writeFileSync(CONFIG_FILE, jsonStr, 'utf-8');

      // Replicar en /public/site-config.json para respaldo y despliegues estáticos
      try {
        fs.writeFileSync(PUBLIC_CONFIG_FILE, jsonStr, 'utf-8');
      } catch (e) {
        console.warn('Could not mirror to public/site-config.json:', e);
      }

      console.log(`[Config Saved] Updated on server at ${new Date().toISOString()}`);

      return res.json({
        success: true,
        message: 'Configuración guardada exitosamente en el disco del servidor.',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[API Config Error] Saving config:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Subida de imágenes de portada o logos al servidor
  app.post('/api/upload', (req, res) => {
    try {
      const { image, filename } = req.body || {};

      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, error: 'No se recibió imagen para procesar.' });
      }

      // Si es un Data URL base64, lo convertimos a archivo en el servidor
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mime = matches[1];
        const base64Data = matches[2];
        const ext = mime.split('/')[1]?.replace('+xml', '') || 'jpg';
        const cleanName = filename
          ? filename.replace(/[^a-zA-Z0-9_-]/g, '') + `-${Date.now()}.${ext}`
          : `cover-${Date.now()}.${ext}`;

        const filePath = path.join(UPLOADS_DIR, cleanName);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        const publicUrl = `/uploads/${cleanName}`;
        return res.json({
          success: true,
          url: publicUrl,
          filename: cleanName,
          message: 'Imagen guardada en el servidor exitosamente.',
        });
      }

      // Si ya era una URL normal, retornarla
      return res.json({
        success: true,
        url: image,
        message: 'URL de imagen registrada.',
      });
    } catch (err: any) {
      console.error('[API Upload Error]:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Bandeja de Leads persistente en el servidor
  app.get('/api/leads', (req, res) => {
    try {
      if (fs.existsSync(LEADS_FILE)) {
        const data = fs.readFileSync(LEADS_FILE, 'utf-8');
        return res.json({ success: true, leads: JSON.parse(data) });
      }
      return res.json({ success: true, leads: [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/leads', (req, res) => {
    try {
      const newLead = req.body;
      let leads: any[] = [];
      if (fs.existsSync(LEADS_FILE)) {
        try {
          leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
        } catch {
          leads = [];
        }
      }
      leads.unshift(newLead);
      fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
      return res.json({ success: true, message: 'Lead registrado en el servidor' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // MODO DESARROLLO (VITE) O PRODUCCIÓN
  // ==========================================
  if (!isProd) {
    // Montar middlewares de Vite en Express
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // En producción servir la compilación estática de dist/
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Best Book Marketing Server corriendo en http://0.0.0.0:${PORT}`);
    console.log(`📁 Persistencia en disco activa: ${DATA_DIR}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
});
