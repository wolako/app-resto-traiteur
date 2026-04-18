// server.js - VERSION CORRIGÉE (ngrok + payment-accounts)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pool } = require('./config/db');

dotenv.config();

// Routes
const authRoutes          = require('./routes/auth');
const businessRoutes      = require('./routes/businesses');
const menuRoutes          = require('./routes/menus');
const menuItemRoutes      = require('./routes/menuItems');
const orderRoutes         = require('./routes/orders');
const reservationRoutes   = require('./routes/reservations');
const paymentRoutes       = require('./routes/payments');
const adminRoutes         = require('./routes/admin');
const notificationRoutes  = require('./routes/notifications');
const clientRoutes        = require('./routes/client');
const subscriptionRoutes  = require('./routes/subscriptions');
const settingsRoutes      = require('./routes/settings');
const commissionRoutes    = require('./routes/commissions');
const chatRoutes          = require('./routes/chat');
const uploadRoutes        = require('./routes/upload');
const supportRoutes       = require('./routes/support');
const brandingRoutes      = require('./routes/branding');
const reviewRoutes        = require('./routes/reviews');
const testimonialRoutes   = require('./routes/testimonials');
const analyticsRoutes     = require('./routes/analytics');
const contactRoutes       = require('./routes/contact');
const paymentAccountRoutes = require('./routes/paymentAccounts'); // ✅ NOUVEAU

// Utilitaires
const { logger }                      = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { generalLimiter }              = require('./middleware/rateLimiter');
const { httpLogger }                  = require('./utils/logger');
const { createSuperAdmin }            = require('./seed_admin');
const chatSocket                      = require('./socket/chatSocket');
const { scheduleExpiryReminders }     = require('./jobs/subscriptionExpiryJob');

const app    = express();
const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────
// ✅ CORS — helper qui accepte string ET RegExp
// ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:3000',
  /^https:\/\/[a-zA-Z0-9-]+\.ngrok-free\.app$/,
  /^https:\/\/[a-zA-Z0-9-]+\.ngrok-free\.dev$/,
  /^https:\/\/[a-zA-Z0-9-]+\.ngrok\.io$/,
];

// Si une variable d'env FRONTEND_URL est définie, l'ajouter
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.unshift(process.env.FRONTEND_URL);
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // requêtes sans Origin (curl, Postman, etc.)
  return ALLOWED_ORIGINS.some(pattern =>
    typeof pattern === 'string'
      ? pattern === origin
      : pattern.test(origin)
  );
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS bloqué pour l'origine : ${origin}`);
      callback(new Error(`CORS: origine non autorisée — ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization',
    'X-Session-Id', 'X-Requested-With',
    // ✅ Headers ajoutés par ngrok
    'ngrok-skip-browser-warning',
    'x-forwarded-for', 'x-real-ip',
  ],
};

// ─────────────────────────────────────────────────────────────
// Configuration Socket.IO
// ─────────────────────────────────────────────────────────────
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('Socket.IO: origine non autorisée'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Middleware auth Socket.IO
io.use(async (socket, next) => {
  try {
    const token      = socket.handshake.auth.token;
    const guestName  = socket.handshake.auth.guestName;
    const guestPhone = socket.handshake.auth.guestPhone;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = {
          userId:     decoded.id || decoded.userId,
          email:      decoded.email,
          role:       decoded.role,
          first_name: decoded.first_name,
          last_name:  decoded.last_name,
        };
        if (!socket.user.userId || !socket.user.role) {
          return next(new Error('Invalid token: missing required fields'));
        }
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    } else if (guestName && guestPhone) {
      socket.user = { role: 'guest', guestName, guestPhone, userId: null };
      next();
    } else {
      next(new Error('Authentication required'));
    }
  } catch {
    next(new Error('Authentication failed'));
  }
});

chatSocket(io);
app.set('io', io);

// ─────────────────────────────────────────────────────────────
// Middlewares sécurité
// ─────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ✅ OPTIONS préflight AVANT le CORS — important pour ngrok
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(httpLogger);

// ✅ Ajouter le header ngrok sur toutes les réponses (évite la page d'avertissement)
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// ─────────────────────────────────────────────────────────────
// Fichiers statiques
// ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // ✅ Headers CORS pour que Angular puisse charger les images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(filePath)) {
      const ext = path.extname(filePath).slice(1).replace('jpg', 'jpeg');
      res.setHeader('Content-Type', `image/${ext}`);
    }
  },
}));

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success:     true,
    message:     'API RestoTraiteur opérationnelle',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV,
    socketIO:    'active',
  });
});

// ─────────────────────────────────────────────────────────────
// Webhooks AVANT rate limiter
// ─────────────────────────────────────────────────────────────
app.post(
  '/api/payments/webhook/cinetpay',
  require('./controllers/paymentController').cinetpayWebhook
);
app.post(
  '/api/payments/webhook/cinetpay/deposit',
  require('./controllers/paymentController').cinetpayDepositWebhook
);

// Chat AVANT rate limiter
app.use('/api/chat', chatRoutes);

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ─────────────────────────────────────────────────────────────
// Routes API
// ─────────────────────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/businesses',       businessRoutes);
app.use('/api/menus',            menuRoutes);
app.use('/api/menu-items',       menuItemRoutes);
app.use('/api/orders',           orderRoutes);
app.use('/api/reservations',     reservationRoutes);
app.use('/api/payments',         paymentRoutes);
app.use('/api/admin',            adminRoutes);
app.use('/api/notifications',    notificationRoutes);
app.use('/api/client',           clientRoutes);
app.use('/api/subscriptions',    subscriptionRoutes);
app.use('/api/settings',         settingsRoutes);
app.use('/api/commissions',      commissionRoutes);
app.use('/api/upload',           uploadRoutes);
app.use('/api/support',          supportRoutes);
app.use('/api/branding',         brandingRoutes);
app.use('/api/reviews',          reviewRoutes);
app.use('/api/testimonials',     testimonialRoutes);
app.use('/api/analytics',        analyticsRoutes);
app.use('/api/contact',          contactRoutes);
app.use('/api/payment-accounts', paymentAccountRoutes); 

// ─────────────────────────────────────────────────────────────
// Frontend Angular (production build)
// ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist/app-resto-traiteur/browser')));

app.get('*', (req, res) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, 'dist/app-resto-traiteur/browser/index.html'));
  }
});

// ─────────────────────────────────────────────────────────────
// Gestion des erreurs
// ─────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────
// Démarrage serveur
// ─────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');

    scheduleExpiryReminders();
    await createSuperAdmin();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 RestoTraiteur — Backend API');
      console.log('='.repeat(60));
      console.log(`📍 Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 URL         : http://localhost:${PORT}`);
      console.log(`📊 Health      : http://localhost:${PORT}/health`);
      console.log(`📚 API Base    : http://localhost:${PORT}/api`);
      console.log(`💬 Socket.IO   : ws://localhost:${PORT}`);
      console.log(`📁 Uploads     : http://localhost:${PORT}/uploads`);
      console.log('='.repeat(60));
      logger.info('Server started', {
        port: PORT, environment: process.env.NODE_ENV, nodeVersion: process.version,
      });
    });
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    logger.error('Database connection error', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGTERM', async () => { io.close(); await pool.end(); process.exit(0); });
process.on('SIGINT',  async () => { io.close(); await pool.end(); process.exit(0); });

start();