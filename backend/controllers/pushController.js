const { pool } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ─── Récupérer la clé publique VAPID ──────────────────────────
const getVapidPublicKey = asyncHandler(async (req, res) => {
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ─── Enregistrer un abonnement push ───────────────────────────
const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;

  console.log('[Push] 📥 Requête d\'abonnement reçue pour user', req.user.id);
  console.log('[Push] Endpoint:', endpoint?.substring(0, 60) + '...');

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    console.error('[Push] ❌ Données d\'abonnement invalides:', { endpoint: !!endpoint, p256dh: !!keys?.p256dh, auth: !!keys?.auth });
    return res.status(400).json({ success: false, error: 'Abonnement push invalide' });
  }

  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = $3, auth = $4, user_agent = $5`,
    [req.user.id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
  );

  console.log('[Push] ✅ Abonnement enregistré en base pour user', req.user.id);
  res.json({ success: true, message: 'Abonnement push enregistré' });
});

// ─── Supprimer les abonnements push de l'utilisateur ──────────
const unsubscribe = asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [req.user.id]);
  logger.info('Désabonnement push', { userId: req.user.id });
  res.json({ success: true, message: 'Désabonnement effectué' });
});

module.exports = { getVapidPublicKey, subscribe, unsubscribe };