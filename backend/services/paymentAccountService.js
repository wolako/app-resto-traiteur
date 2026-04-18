const { pool } = require('../config/db');

function normalizePayoutMethod(method) {
  if (!method) return method;
  const map = {
    'mixx by yas': 'mixx',
    'mixx':        'mixx',
    'flooz':       'flooz',
    'bank':        'bank',
    'banque':      'bank',
  };
  return map[String(method).toLowerCase().trim()] ?? method;
}

async function getBusinessByUser(userId) {
  const result = await pool.query(
    'SELECT id FROM businesses WHERE user_id = $1', [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// ─── Compte actif uniquement ───────────────────────────────
async function getPaymentAccount(businessId) {
  const result = await pool.query(
    `SELECT * FROM business_payment_accounts 
     WHERE business_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [businessId]
  );
  return result.rows[0] || null;
}

// ─── Tous les comptes (actif + historique) ─────────────────
async function getAllPaymentAccounts(businessId) {
  const result = await pool.query(
    `SELECT * FROM business_payment_accounts 
     WHERE business_id = $1 
     ORDER BY is_active DESC, created_at DESC`,
    [businessId]
  );
  return result.rows;
}

// ─── Créer un nouveau compte (désactive l'ancien) ──────────
async function savePaymentAccount(businessId, data) {
  const preferred_payout_method = normalizePayoutMethod(data.preferred_payout_method);

  console.log('[savePaymentAccount] méthode:', data.preferred_payout_method, '→', preferred_payout_method);

  const {
    mixx_number,
    flooz_number,
    bank_name,
    bank_account_number,
    bank_account_holder,
    bank_iban,
    legal_name,
    business_registration_number,
    business_type,
    cinetpay_site_id,
    cinetpay_api_key,
    account_label,
    // ✅ Si true : modifie le compte actif au lieu d'en créer un nouveau
    edit_existing,
    existing_account_id,
  } = data;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let result;

    if (edit_existing && existing_account_id) {
      // ── MODE MODIFICATION : met à jour le compte existant ──
      result = await client.query(
        `UPDATE business_payment_accounts SET
          preferred_payout_method      = $1,
          mixx_number                  = $2,
          flooz_number                 = $3,
          bank_name                    = $4,
          bank_account_number          = $5,
          bank_account_holder          = $6,
          bank_iban                    = $7,
          legal_name                   = $8,
          business_registration_number = $9,
          business_type                = $10,
          cinetpay_site_id             = $11,
          cinetpay_api_key             = $12,
          account_label                = $13,
          status                       = 'pending_verification',
          rejection_reason             = NULL,
          verified_at                  = NULL,
          updated_at                   = NOW()
        WHERE id = $14 AND business_id = $15
        RETURNING *`,
        [
          preferred_payout_method,
          mixx_number         || null,
          flooz_number        || null,
          bank_name           || null,
          bank_account_number || null,
          bank_account_holder || null,
          bank_iban           || null,
          legal_name,
          business_registration_number || null,
          business_type       || 'individual',
          cinetpay_site_id    || null,
          cinetpay_api_key    || null,
          account_label       || null,
          existing_account_id,
          businessId,
        ]
      );
    } else {
      // ── MODE NOUVEAU COMPTE : désactive l'ancien, crée le nouveau ──

      // 1. Désactiver tous les comptes actifs existants
      await client.query(
        `UPDATE business_payment_accounts 
         SET is_active = false, replaced_at = NOW()
         WHERE business_id = $1 AND is_active = true`,
        [businessId]
      );

      // 2. Insérer le nouveau compte actif
      result = await client.query(
        `INSERT INTO business_payment_accounts (
          business_id, preferred_payout_method,
          mixx_number, flooz_number,
          bank_name, bank_account_number, bank_account_holder, bank_iban,
          legal_name, business_registration_number, business_type,
          cinetpay_site_id, cinetpay_api_key,
          account_label, is_active, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,'pending_verification')
        RETURNING *`,
        [
          businessId,
          preferred_payout_method,
          mixx_number         || null,
          flooz_number        || null,
          bank_name           || null,
          bank_account_number || null,
          bank_account_holder || null,
          bank_iban           || null,
          legal_name,
          business_registration_number || null,
          business_type       || 'individual',
          cinetpay_site_id    || null,
          cinetpay_api_key    || null,
          account_label       || null,
        ]
      );
    }

    await client.query('COMMIT');
    return result.rows[0];

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getBusinessByUser,
  getPaymentAccount,
  getAllPaymentAccounts,
  savePaymentAccount,
};