// jobs/subscriptionExpiryJob.js
const cron         = require('node-cron');
const { pool }     = require('../config/db');
const { emailService } = require('../services/emailService');
const { smsService }   = require('../services/smsService');
const logger       = require('../utils/logger'); // ✅ import direct (pas déstructuré)
const Subscription = require('../models/Subscription');

const APP_URL          = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:4200';
const SUBSCRIPTION_URL = `${APP_URL}/restaurant/dashboard?tab=subscription`;
const REMINDER_DAYS    = [7, 3, 1];

// ════════════════════════════════════════════════════════════
// Expirer + rétrograder au plan gratuit
// ════════════════════════════════════════════════════════════
async function expireOverdueSubscriptions() {
  try {
    const expired = await Subscription.expireOverdueSubscriptions();

    if (expired.length === 0) {
      logger.info('[SubExpiry] Aucun abonnement à expirer');
      return expired;
    }

    logger.info(`[SubExpiry] ${expired.length} abonnement(s) expiré(s)`);

    // Récupérer le plan gratuit une seule fois
    const freePlanResult = await pool.query(
      `SELECT id FROM subscription_plans WHERE name = 'free' AND is_active = true LIMIT 1`
    );
    const freePlanId = freePlanResult.rows[0]?.id;

    if (!freePlanId) {
      logger.error('[SubExpiry] Plan gratuit introuvable en base !');
    }

    for (const sub of expired) {
      try {
        // Vérifier si un autre abonnement actif existe déjà
        const existingActive = await pool.query(
          `SELECT id FROM business_subscriptions
           WHERE business_id = $1 AND status = 'active'
             AND (end_date IS NULL OR end_date > NOW())
           LIMIT 1`,
          [sub.business_id]
        );

        if (existingActive.rows.length === 0 && freePlanId) {
          // ✅ Assigner plan gratuit avec end_date = NULL (ne ré-expire jamais)
          await pool.query(
            `INSERT INTO business_subscriptions
               (business_id, plan_id, status, start_date, end_date, auto_renew)
             VALUES ($1, $2, 'active', NOW(), NULL, false)`,
            [sub.business_id, freePlanId]
          );

          // ✅ CORRECTION CRITIQUE : NE PAS désactiver le business
          // Un établissement en plan gratuit reste VISIBLE sur la page d'accueil
          // is_active = true est conservé
          await pool.query(
            `UPDATE businesses
             SET is_active = true, updated_at = NOW()
             WHERE id = $1`,
            [sub.business_id]
          );

          logger.info(
            `[SubExpiry] Business #${sub.business_id} → plan gratuit assigné, reste visible`
          );
        }

        // Notifier l'établissement
        await notifyExpiredSubscription(sub);

      } catch (err) {
        logger.error(`[SubExpiry] Erreur business #${sub.business_id}:`, err.message);
      }
    }

    return expired;
  } catch (error) {
    logger.error('[SubExpiry] Erreur expiration:', error);
    return [];
  }
}

// ════════════════════════════════════════════════════════════
// Notification expiration
// ════════════════════════════════════════════════════════════
async function notifyExpiredSubscription(sub) {
  try {
    const infoResult = await pool.query(
      `SELECT
         b.name            AS business_name,
         b.phone           AS business_phone,
         u.email           AS owner_email,
         u.first_name      AS owner_first_name,
         u.phone           AS owner_phone,
         sp.display_name   AS plan_name
       FROM businesses b
       JOIN users               u  ON b.user_id    = u.id
       JOIN business_subscriptions bs ON bs.business_id = b.id
       JOIN subscription_plans  sp ON bs.plan_id   = sp.id
       WHERE b.id = $1
       ORDER BY bs.created_at DESC LIMIT 1`,
      [sub.business_id]
    );

    if (infoResult.rows.length === 0) return;
    const info = infoResult.rows[0];

    try {
      await emailService.sendSubscriptionExpiredNotification({
        ownerEmail:     info.owner_email,
        ownerFirstName: info.owner_first_name,
        businessName:   info.business_name,
        planName:       info.plan_name,
        endDate:        sub.end_date,
        renewUrl:       SUBSCRIPTION_URL
      });
      logger.info(`[SubExpiry] Email expiration → ${info.owner_email}`);
    } catch (err) {
      logger.error('[SubExpiry] Erreur email:', err.message);
    }

    const phone = info.owner_phone || info.business_phone;
    if (phone) {
      try {
        await smsService.sendSubscriptionExpiredNotification({
          phone,
          businessName: info.business_name,
          planName:     info.plan_name
        });
      } catch (err) {
        logger.warn('[SubExpiry] Erreur SMS:', err.message);
      }
    }
  } catch (err) {
    logger.error('[SubExpiry] Erreur notification:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
// Rappels avant expiration (J-7, J-3, J-1)
// ════════════════════════════════════════════════════════════
async function getExpiringSubscriptions(daysBeforeExpiry) {
  const result = await pool.query(
    `SELECT
       bs.id            AS subscription_id,
       bs.business_id,
       bs.end_date,
       bs.plan_id,
       sp.name          AS plan_name,
       sp.price         AS plan_price,
       b.name           AS business_name,
       b.type           AS business_type,
       b.phone          AS business_phone,
       u.email          AS owner_email,
       u.first_name     AS owner_first_name,
       u.last_name      AS owner_last_name,
       u.phone          AS owner_phone
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id    = sp.id
     JOIN businesses         b  ON bs.business_id = b.id
     JOIN users              u  ON b.user_id      = u.id
     WHERE bs.status = 'active'
       AND sp.name   != 'free'
       AND DATE(bs.end_date) = CURRENT_DATE + INTERVAL '${daysBeforeExpiry} days'
     ORDER BY bs.end_date ASC`
  );
  return result.rows;
}

async function reminderAlreadySent(subscriptionId, daysBeforeExpiry) {
  try {
    const result = await pool.query(
      `SELECT id FROM subscription_reminders
       WHERE subscription_id = $1
         AND days_before = $2
         AND DATE(sent_at) = CURRENT_DATE`,
      [subscriptionId, daysBeforeExpiry]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function logReminder(subscriptionId, daysBeforeExpiry, channels) {
  try {
    await pool.query(
      `INSERT INTO subscription_reminders (subscription_id, days_before, channels, sent_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [subscriptionId, daysBeforeExpiry, channels.join(',')]
    );
  } catch {
    // Table optionnelle — ignoré
  }
}

async function processReminders(daysBeforeExpiry) {
  const subscriptions = await getExpiringSubscriptions(daysBeforeExpiry);

  if (subscriptions.length === 0) {
    logger.info(`[SubExpiry] Aucun abonnement expirant dans ${daysBeforeExpiry} jour(s)`);
    return;
  }

  logger.info(`[SubExpiry] ${subscriptions.length} rappel(s) J-${daysBeforeExpiry}`);

  for (const sub of subscriptions) {
    if (await reminderAlreadySent(sub.subscription_id, daysBeforeExpiry)) {
      continue;
    }

    const sentChannels = [];

    try {
      const emailResult = await emailService.sendSubscriptionExpiryReminder({
        ownerEmail:     sub.owner_email,
        ownerFirstName: sub.owner_first_name,
        businessName:   sub.business_name,
        planName:       sub.plan_name,
        planPrice:      sub.plan_price,
        endDate:        sub.end_date,
        daysLeft:       daysBeforeExpiry,
        renewUrl:       SUBSCRIPTION_URL
      });
      if (emailResult.success) {
        sentChannels.push('email');
        logger.info(`[SubExpiry] Email → ${sub.owner_email} (J-${daysBeforeExpiry})`);
      }
    } catch (err) {
      logger.error(`[SubExpiry] Erreur email sub #${sub.subscription_id}:`, err.message);
    }

    const phoneNumber = sub.owner_phone || sub.business_phone;
    if (phoneNumber && daysBeforeExpiry <= 3) {
      try {
        const smsResult = await smsService.sendSubscriptionExpiryReminder({
          phone:        phoneNumber,
          businessName: sub.business_name,
          planName:     sub.plan_name,
          daysLeft:     daysBeforeExpiry
        });
        if (smsResult.success) sentChannels.push('sms');
      } catch (err) {
        logger.warn(`[SubExpiry] Erreur SMS sub #${sub.subscription_id}:`, err.message);
      }
    }

    if (sentChannels.length > 0) {
      await logReminder(sub.subscription_id, daysBeforeExpiry, sentChannels);
    }
  }
}

// ════════════════════════════════════════════════════════════
// Fonction principale
// ════════════════════════════════════════════════════════════
async function runExpiryReminders() {
  logger.info('[SubExpiry] ── Démarrage du job ──');
  try {
    await expireOverdueSubscriptions();
    for (const days of REMINDER_DAYS) {
      await processReminders(days);
    }
    logger.info('[SubExpiry] ── Job terminé ──');
  } catch (error) {
    logger.error('[SubExpiry] Erreur globale:', error);
  }
}

// ════════════════════════════════════════════════════════════
// Cron jobs
// ════════════════════════════════════════════════════════════
function scheduleExpiryReminders() {
  // 00:05 — expiration
  cron.schedule('5 0 * * *', async () => {
    logger.info('[SubExpiry] Cron 00:05 — expiration');
    await expireOverdueSubscriptions();
  }, { timezone: 'Africa/Lome' });

  // 09:00 — rappels
  cron.schedule('0 9 * * *', async () => {
    logger.info('[SubExpiry] Cron 09:00 — rappels');
    for (const days of REMINDER_DAYS) {
      await processReminders(days);
    }
  }, { timezone: 'Africa/Lome' });

  logger.info(`[SubExpiry] Crons planifiés`);
}

module.exports = {
  scheduleExpiryReminders,
  runExpiryReminders,
  expireOverdueSubscriptions
};