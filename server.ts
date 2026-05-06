import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route: Proxy to fetch M3U8 content to bypass CORS
  app.get("/api/proxy-m3u", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL inválida" });
    }

    console.log(`Proxying request to: ${url}`);

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        // Don't follow too many redirects
        maxRedirects: 5,
        // Accept any response status to handle it manually if needed
        validateStatus: (status) => status >= 200 && status < 300,
      });
      
      console.log(`Successfully fetched M3U8 from ${url}. Status: ${response.status}`);
      res.send(response.data);
    } catch (error: any) {
      console.error(`Error proxying M3U8 from ${url}:`, error.message);
      
      if (error.response) {
        // The server responded with a status code outside the 2xx range
        res.status(error.response.status).json({ 
          error: `El servidor remoto respondió con error ${error.response.status}`,
          details: error.response.data
        });
      } else if (error.request) {
        // The request was made but no response was received
        res.status(504).json({ error: "No se recibió respuesta del servidor remoto (Timeout o Down)." });
      } else {
        // Something happened in setting up the request
        res.status(500).json({ error: `Error de configuración: ${error.message}` });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
