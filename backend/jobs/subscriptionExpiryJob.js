// jobs/subscriptionExpiryJob.js
// Tâche planifiée qui envoie des rappels d'expiration d'abonnement
// Lancer via node-cron depuis server.js

const cron = require('node-cron');
const { pool } = require('../config/db');
const { emailService } = require('../services/emailService');
const { smsService } = require('../services/smsService');
const { logger } = require('../utils/logger');

// ─── Jours avant expiration qui déclenchent un rappel ────────────────────────
const REMINDER_DAYS = [7, 3, 1]; // J-7, J-3, J-1

/**
 * Récupère tous les abonnements actifs qui expirent dans exactement N jours
 */
async function getExpiringSubscriptions(daysBeforeExpiry) {
  const result = await pool.query(
    `SELECT
       bs.id              AS subscription_id,
       bs.business_id,
       bs.end_date,
       bs.plan_id,
       sp.name            AS plan_name,
       sp.price           AS plan_price,
       b.name             AS business_name,
       b.type             AS business_type,
       b.phone            AS business_phone,
       u.email            AS owner_email,
       u.first_name       AS owner_first_name,
       u.last_name        AS owner_last_name,
       u.phone            AS owner_phone
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     JOIN businesses          b  ON bs.business_id = b.id
     JOIN users               u  ON b.user_id = u.id
     WHERE bs.status = 'active'
       AND sp.name != 'gratuit'          -- Ne pas rappeler le plan gratuit
       AND DATE(bs.end_date) = CURRENT_DATE + INTERVAL '${daysBeforeExpiry} days'
     ORDER BY bs.end_date ASC`,
    []
  );
  return result.rows;
}

/**
 * Récupère les abonnements déjà expirés (end_date = hier)
 * pour envoyer un "dernier" email le jour J
 */
async function getExpiredYesterdaySubscriptions() {
  const result = await pool.query(
    `SELECT
       bs.id              AS subscription_id,
       bs.business_id,
       bs.end_date,
       sp.name            AS plan_name,
       sp.price           AS plan_price,
       b.name             AS business_name,
       b.type             AS business_type,
       b.phone            AS business_phone,
       u.email            AS owner_email,
       u.first_name       AS owner_first_name,
       u.phone            AS owner_phone
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     JOIN businesses          b  ON bs.business_id = b.id
     JOIN users               u  ON b.user_id = u.id
     WHERE bs.status = 'active'
       AND sp.name != 'gratuit'
       AND DATE(bs.end_date) = CURRENT_DATE - INTERVAL '1 day'`,
    []
  );
  return result.rows;
}

/**
 * Vérifie qu'un rappel n'a pas déjà été envoyé aujourd'hui pour ce sub + nb de jours
 */
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
    // Table inexistante → on ne bloque pas
    return false;
  }
}

/**
 * Enregistre l'envoi du rappel (table optionnelle de traçabilité)
 */
async function logReminder(subscriptionId, daysBeforeExpiry, channels) {
  try {
    await pool.query(
      `INSERT INTO subscription_reminders (subscription_id, days_before, channels, sent_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [subscriptionId, daysBeforeExpiry, channels.join(',')]
    );
  } catch {
    // Table optionnelle, on ignore si elle n'existe pas
  }
}

/**
 * Traite les rappels pour un nombre de jours donné
 */
async function processReminders(daysBeforeExpiry) {
  const subscriptions = await getExpiringSubscriptions(daysBeforeExpiry);

  if (subscriptions.length === 0) {
    logger.info(`[SubExpiry] Aucun abonnement expirant dans ${daysBeforeExpiry} jour(s)`);
    return;
  }

  logger.info(`[SubExpiry] ${subscriptions.length} abonnement(s) expirant dans ${daysBeforeExpiry} jour(s)`);

  for (const sub of subscriptions) {
    // Anti-doublon : vérifier si rappel déjà envoyé aujourd'hui
    if (await reminderAlreadySent(sub.subscription_id, daysBeforeExpiry)) {
      logger.info(`[SubExpiry] Rappel déjà envoyé pour sub #${sub.subscription_id} (J-${daysBeforeExpiry})`);
      continue;
    }

    const sentChannels = [];

    // ── Email ────────────────────────────────────────────────────────────────
    try {
      const emailResult = await emailService.sendSubscriptionExpiryReminder({
        ownerEmail:     sub.owner_email,
        ownerFirstName: sub.owner_first_name,
        businessName:   sub.business_name,
        planName:       sub.plan_name,
        planPrice:      sub.plan_price,
        endDate:        sub.end_date,
        daysLeft:       daysBeforeExpiry
      });

      if (emailResult.success) {
        sentChannels.push('email');
        logger.info(`[SubExpiry] Email envoyé → ${sub.owner_email} (J-${daysBeforeExpiry}, ${sub.business_name})`);
      } else {
        logger.warn(`[SubExpiry] Échec email → ${sub.owner_email}: ${emailResult.error}`);
      }
    } catch (err) {
      logger.error(`[SubExpiry] Erreur email sub #${sub.subscription_id}:`, err.message);
    }

    // ── SMS (seulement J-1 et J-0 pour ne pas spammer) ───────────────────────
    const phoneNumber = sub.owner_phone || sub.business_phone;
    if (phoneNumber && daysBeforeExpiry <= 3) {
      try {
        const smsResult = await smsService.sendSubscriptionExpiryReminder({
          phone:        phoneNumber,
          businessName: sub.business_name,
          planName:     sub.plan_name,
          daysLeft:     daysBeforeExpiry
        });

        if (smsResult.success) {
          sentChannels.push('sms');
          logger.info(`[SubExpiry] SMS envoyé → ${phoneNumber} (J-${daysBeforeExpiry})`);
        }
      } catch (err) {
        logger.warn(`[SubExpiry] Erreur SMS sub #${sub.subscription_id}:`, err.message);
      }
    }

    // ── Traçabilité ───────────────────────────────────────────────────────────
    if (sentChannels.length > 0) {
      await logReminder(sub.subscription_id, daysBeforeExpiry, sentChannels);
    }
  }
}

/**
 * Traite les abonnements expirés hier (notification "votre abonnement a expiré")
 */
async function processExpiredNotifications() {
  const subscriptions = await getExpiredYesterdaySubscriptions();

  if (subscriptions.length === 0) return;

  logger.info(`[SubExpiry] ${subscriptions.length} abonnement(s) expiré(s) hier`);

  for (const sub of subscriptions) {
    if (await reminderAlreadySent(sub.subscription_id, 0)) continue;

    const sentChannels = [];

    try {
      const emailResult = await emailService.sendSubscriptionExpiredNotification({
        ownerEmail:     sub.owner_email,
        ownerFirstName: sub.owner_first_name,
        businessName:   sub.business_name,
        planName:       sub.plan_name,
        endDate:        sub.end_date
      });
      if (emailResult.success) sentChannels.push('email');
    } catch (err) {
      logger.error(`[SubExpiry] Erreur email expiration sub #${sub.subscription_id}:`, err.message);
    }

    const phoneNumber = sub.owner_phone || sub.business_phone;
    if (phoneNumber) {
      try {
        const smsResult = await smsService.sendSubscriptionExpiredNotification({
          phone:        phoneNumber,
          businessName: sub.business_name,
          planName:     sub.plan_name
        });
        if (smsResult.success) sentChannels.push('sms');
      } catch (err) {
        logger.warn(`[SubExpiry] Erreur SMS expiration:`, err.message);
      }
    }

    if (sentChannels.length > 0) {
      await logReminder(sub.subscription_id, 0, sentChannels);
    }
  }
}

/**
 * Fonction principale : exécute tous les rappels
 */
async function runExpiryReminders() {
  logger.info('[SubExpiry] ── Démarrage des rappels d\'expiration ──');

  try {
    // Rappels J-7, J-3, J-1
    for (const days of REMINDER_DAYS) {
      await processReminders(days);
    }

    // Notification d'expiration effective (J+1 après end_date)
    await processExpiredNotifications();

    logger.info('[SubExpiry] ── Rappels terminés ──');
  } catch (error) {
    logger.error('[SubExpiry] Erreur globale:', error);
  }
}

/**
 * Enregistre le cron job (à appeler depuis server.js)
 * Exécution : chaque jour à 9h00
 */
function scheduleExpiryReminders() {
  // Tous les jours à 09:00
  cron.schedule('0 9 * * *', async () => {
    logger.info('[SubExpiry] Cron déclenché (09:00)');
    await runExpiryReminders();
  }, {
    timezone: 'Africa/Lome'
  });

  logger.info('[SubExpiry] Cron planifié : tous les jours à 09:00 (Lomé)');
}

module.exports = {
  scheduleExpiryReminders,
  runExpiryReminders // Export pour tests manuels via API admin
};