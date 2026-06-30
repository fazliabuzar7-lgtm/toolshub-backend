/**
 * ════════════════════════════════════════════
 * ToolsHub Backend Server
 * Real PDF processing API — PDF to Word, Merge, Split, Compress, Watermark, Extract Text
 * ════════════════════════════════════════════
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Ensure required folders exist ──
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'outputs'));

// ── Security Middleware ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ── CORS — allow your frontend domain ──
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  methods: ['GET', 'POST'],
}));

// ── Logging ──
app.use(morgan('combined'));

// ── Body parsing ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting (prevent abuse) ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP per window
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Static file serving for generated outputs ──
app.use('/files', express.static(path.join(__dirname, 'outputs')));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'ToolsHub Backend API',
    version: '1.0.0',
    endpoints: [
      'POST /api/pdf/to-word',
      'POST /api/pdf/merge',
      'POST /api/pdf/split',
      'POST /api/pdf/compress',
      'POST /api/pdf/watermark',
      'POST /api/pdf/to-text',
      'POST /api/pdf/rotate',
      'POST /api/pdf/to-jpg',
    ],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes ──
app.use('/api/pdf', require('./routes/pdfRoutes'));

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  if (err.message && err.message.includes('File too large')) {
    return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
  }
  res.status(500).json({ error: 'Internal server error. Please try again.' });
});

// ── Cleanup old files every hour (privacy: don't keep files forever) ──
const { cleanupOldFiles } = require('./utils/cleanup');
setInterval(() => {
  cleanupOldFiles(path.join(__dirname, 'uploads'), 60); // delete files older than 60 min
  cleanupOldFiles(path.join(__dirname, 'outputs'), 60);
}, 30 * 60 * 1000); // run every 30 min

app.listen(PORT, () => {
  console.log(`✅ ToolsHub Backend running on port ${PORT}`);
  console.log(`📂 Uploads folder: ${path.join(__dirname, 'uploads')}`);
  console.log(`📂 Outputs folder: ${path.join(__dirname, 'outputs')}`);
});
