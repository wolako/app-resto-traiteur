const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendPushToUser(pool, userId, payload) {
  console.log(`[WebPush] 📤 Tentative d'envoi à l'utilisateur ${userId}`);

  const { rows } = await pool.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  console.log(`[WebPush] ${rows.length} abonnement(s) trouvé(s) en base pour l'utilisateur ${userId}`);

  if (rows.length === 0) {
    console.warn(`[WebPush] ⚠️ AUCUN abonnement pour l'utilisateur ${userId} — le frontend n'a jamais terminé subscribe() avec succès`);
    return;
  }

  for (const sub of rows) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };
    try {
      const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`[WebPush] ✅ Envoyé avec succès (HTTP ${result.statusCode}) — abonnement #${sub.id}`);
    } catch (err) {
      console.error(`[WebPush] ❌ ÉCHEC envoi — abonnement #${sub.id}`, {
        statusCode: err.statusCode,
        body: err.body,
        message: err.message
      });
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`[WebPush] Suppression abonnement expiré #${sub.id}`);
        await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
      }
    }
  }
}

module.exports = { sendPushToUser };