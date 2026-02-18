// server.js - MISE À JOUR
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

// Routes
const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/businesses');
const menuRoutes = require('./routes/menus');
const menuItemRoutes = require('./routes/menuItems');
const orderRoutes = require('./routes/orders');
const reservationRoutes = require('./routes/reservations');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const clientRoutes = require('./routes/client');
const subscriptionRoutes = require('./routes/subscriptions');
const settingsRoutes = require('./routes/settings');
const commissionRoutes = require('./routes/commissions');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const supportRoutes = require('./routes/support');
const brandingRoutes = require('./routes/branding');
const reviewRoutes = require('./routes/reviews');
const testimonialRoutes = require('./routes/testimonials');

// Utilitaires
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const { httpLogger } = require('./utils/logger');
const { createSuperAdmin } = require('./seed_admin');
const chatSocket = require('./socket/chatSocket');
const { scheduleExpiryReminders } = require('./jobs/subscriptionExpiryJob');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuration Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL]
      : ['http://localhost:4200', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Middleware d'authentification Socket.IO (inchangé)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const guestName = socket.handshake.auth.guestName;
    const guestPhone = socket.handshake.auth.guestPhone;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = {
          userId: decoded.id || decoded.userId,
          email: decoded.email,
          role: decoded.role,
          first_name: decoded.first_name,
          last_name: decoded.last_name
        };
        
        if (!socket.user.userId || !socket.user.role) {
          return next(new Error('Invalid token: missing required fields'));
        }
        next();
      } catch (jwtError) {
        next(new Error('Invalid token'));
      }
    } else if (guestName && guestPhone) {
      socket.user = {
        role: 'guest',
        guestName,
        guestPhone,
        userId: null
      };
      next();
    } else {
      next(new Error('Authentication required'));
    }
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

chatSocket(io);
app.set('io', io);

// --- Middlewares de sécurité ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // ✅ Nécessaire pour servir les images
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true
}));

app.use(compression());

// --- Middlewares globaux ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(httpLogger);

// ✅ SERVIR LES FICHIERS STATIQUES (images uploadées)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d', // Cache de 1 jour
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || 
        filePath.endsWith('.png') || filePath.endsWith('.gif') || 
        filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/' + path.extname(filePath).substring(1));
    }
  }
}));

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API Restaurant App opérationnelle',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    socketIO: 'active'
  });
});

// --- Webhook CinetPay (avant rate limiter) ---
app.post('/api/payments/webhook/cinetpay', require('./controllers/paymentController').cinetpayWebhook);

// --- Chat (avant rate limiter) ---
app.use('/api/chat', chatRoutes);

// --- Rate limiting ---
app.use('/api', generalLimiter);

// --- Routes API ---
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/menu-items', menuItemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/testimonials', testimonialRoutes);

// --- Route racine ---
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API Restaurant App',
    version: '1.0.0',
    features: ['REST API', 'Socket.IO Chat', 'Image Upload'],
    endpoints: {
      auth: '/api/auth',
      businesses: '/api/businesses',
      menus: '/api/menus',
      menuItems: '/api/menu-items',
      orders: '/api/orders',
      reservations: '/api/reservations',
      payments: '/api/payments',
      admin: '/api/admin',
      chat: '/api/chat',
      upload: '/api/upload'
    }
  });
});

// --- Gestion des erreurs ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- Start server ---
const start = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');

    scheduleExpiryReminders();

    await createSuperAdmin();

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Restaurant App - Backend API');
      console.log('='.repeat(60));
      console.log(`📍 Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 URL         : http://localhost:${PORT}`);
      console.log(`📊 Health      : http://localhost:${PORT}/health`);
      console.log(`📚 API Base    : http://localhost:${PORT}/api`);
      console.log(`💬 Socket.IO   : ws://localhost:${PORT}`);
      console.log(`📁 Uploads     : http://localhost:${PORT}/uploads`);
      console.log('='.repeat(60));
      
      logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV,
        nodeVersion: process.version,
        socketIO: 'enabled'
      });
    });
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    logger.error('Database connection error', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  console.log('📡 SIGTERM received, closing server...');
  io.close();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📡 SIGINT received, closing server...');
  io.close();
  await pool.end();
  process.exit(0);
});

start();