// controllers/brandingController.js
'use strict';

const { pool } = require('../config/db');
const path     = require('path');
const fs       = require('fs');

// ── Valeurs par défaut ────────────────────────────────────────────────────────
const DEFAULT_BRANDING = {
  primary_color:      '#0d6efd',
  secondary_color:    '#6c757d',
  accent_color:       '#ffc107',
  logo_url:           null,
  logo_square_url:    null,
  banner_url:         null,       // ✅ Bannière profil — DISTINCT de cover
  banner_mobile_url:  null,
  cover_image_url:    null,       // ✅ Image carte home — DISTINCT de banner
  gallery_urls:       [],
  tagline:            null,
  footer_text:        null,
  footer_links:       [],
  facebook_url:       null,
  instagram_url:      null,
  whatsapp_number:    null,
  tiktok_url:         null,
  opening_hours_text: null,
  highlight_1_icon:   'bi-award',
  highlight_1_text:   null,
  highlight_2_icon:   'bi-clock',
  highlight_2_text:   null,
  highlight_3_icon:   'bi-geo-alt',
  highlight_3_text:   null,
};

async function getBusinessSubscription(businessId) {
  const result = await pool.query(
    `SELECT sp.custom_branding, sp.name AS plan_name
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     WHERE bs.business_id = $1 AND bs.status = 'active'
     LIMIT 1`,
    [businessId]
  );
  return result.rows[0] || null;
}

// ── GET /api/branding/:businessId — PUBLIC ────────────────────────────────────
exports.getBranding = async (req, res) => {
  try {
    const { businessId } = req.params;

    const result = await pool.query(
      'SELECT * FROM business_branding WHERE business_id = $1',
      [businessId]
    );

    const row = result.rows[0];
    const branding = row
      ? {
          ...DEFAULT_BRANDING,
          ...row,
          gallery_urls:    row.gallery_urls    || [],
          footer_links:    row.footer_links    || [],
          payment_methods: row.payment_methods || [],
          cover_image_url: row.cover_image_url || null,   // ✅ carte home
          banner_url:      row.banner_url      || null,   // ✅ bannière profil
          practical_note:  row.practical_note  || null,
        }
      : {
          ...DEFAULT_BRANDING,
          business_id:     parseInt(businessId),
          payment_methods: [],
          cover_image_url: null,
          banner_url:      null,
          practical_note:  null,
        };

    return res.json({ success: true, data: branding });
  } catch (err) {
    console.error('[getBranding]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── PUT /api/branding/:businessId — Mettre à jour ────────────────────────────
exports.updateBranding = async (req, res) => {
  try {
    const businessId = req.business.id;

    // ✅ 1. Traiter cover_image_url EN PREMIER — sans check Premium
    // Si la requête ne contient QUE cover_image_url, on la traite et on sort
    if (req.body.cover_image_url !== undefined && Object.keys(req.body).length === 1) {
      const coverUrl = req.body.cover_image_url || null;

      if (coverUrl && !coverUrl.startsWith('/') && !coverUrl.startsWith('http')) {
        return res.status(400).json({ success: false, error: 'URL cover invalide' });
      }

      await pool.query(
        `INSERT INTO business_branding (business_id, cover_image_url)
         VALUES ($1, $2)
         ON CONFLICT (business_id) DO UPDATE 
         SET cover_image_url = $2, updated_at = NOW()`,
        [businessId, coverUrl]
      );

      await pool.query(
        `UPDATE businesses SET cover_image_url = $1, updated_at = NOW() WHERE id = $2`,
        [coverUrl, businessId]
      );

      const coverResult = await pool.query(
        'SELECT * FROM business_branding WHERE business_id = $1',
        [businessId]
      );
      return res.json({ success: true, data: coverResult.rows[0] });
    }

    // ✅ 2. Pour tout le reste — check Premium obligatoire
    const sub = await getBusinessSubscription(businessId);
    if (!sub || !sub.custom_branding) {
      return res.status(403).json({
        success: false,
        error: 'Le branding personnalisé nécessite un abonnement Premium',
        code: 'PREMIUM_REQUIRED',
      });
    }

    const allowed = [
      'primary_color', 'secondary_color', 'accent_color',
      'logo_url', 'logo_square_url',
      'banner_url',
      'banner_mobile_url',
      // ✅ cover_image_url retiré de la liste Premium
      // Il est géré séparément ci-dessus sans restriction de plan
      'gallery_urls',
      'tagline', 'footer_text', 'footer_links',
      'practical_note',
      'payment_methods',
      'facebook_url', 'instagram_url', 'whatsapp_number', 'tiktok_url',
      'opening_hours_text',
      'highlight_1_icon', 'highlight_1_text',
      'highlight_2_icon', 'highlight_2_text',
      'highlight_3_icon', 'highlight_3_text',
      'highlights',
    ];

    // Validation couleurs
    for (const f of ['primary_color', 'secondary_color', 'accent_color']) {
      if (req.body[f] && !/^#[0-9A-Fa-f]{6}$/.test(req.body[f])) {
        return res.status(400).json({ success: false, error: `Couleur invalide: ${f}` });
      }
    }

    // Validation URLs
    const urlFields = [
      'logo_url', 'logo_square_url',
      'banner_url', 'banner_mobile_url',
      'facebook_url', 'instagram_url', 'tiktok_url',
      // ✅ cover_image_url retiré — géré séparément
    ];
    for (const f of urlFields) {
      if (req.body[f] && req.body[f] !== '' && !req.body[f].startsWith('/') && !req.body[f].startsWith('http')) {
        return res.status(400).json({ success: false, error: `URL invalide: ${f}` });
      }
    }

    // Validation gallery_urls
    if (req.body.gallery_urls !== undefined) {
      if (!Array.isArray(req.body.gallery_urls)) {
        return res.status(400).json({ success: false, error: 'gallery_urls doit être un tableau' });
      }
      const plan = await pool.query(
        `SELECT max_photos FROM subscription_plans sp
         JOIN business_subscriptions bs ON sp.id = bs.plan_id
         WHERE bs.business_id = $1 AND bs.status = 'active' LIMIT 1`,
        [businessId]
      );
      const maxPhotos = plan.rows[0]?.max_photos ?? 50;
      if (req.body.gallery_urls.length > maxPhotos) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${maxPhotos} photos dans la galerie`
        });
      }
    }

    // Filtrer les champs autorisés
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour' });
    }

    // ✅ GUARD : empêcher qu'une cover soit stockée comme banner
    if (updates.banner_url && typeof updates.banner_url === 'string') {
      const bUrl = updates.banner_url.trim();
      if (bUrl.includes('/covers/') || bUrl.includes('cover-business-')) {
        console.warn(`[updateBranding] GUARD banner_url contient une cover — ignoré pour business ${businessId}`);
        delete updates.banner_url;
      }
    }
    if (updates.banner_mobile_url && typeof updates.banner_mobile_url === 'string') {
      const bUrl = updates.banner_mobile_url.trim();
      if (bUrl.includes('/covers/') || bUrl.includes('cover-business-')) {
        delete updates.banner_mobile_url;
      }
    }

    // Sérialiser JSONB
    if (updates.gallery_urls    !== undefined) updates.gallery_urls    = JSON.stringify(updates.gallery_urls);
    if (updates.footer_links    !== undefined) updates.footer_links    = JSON.stringify(updates.footer_links);
    if (updates.payment_methods !== undefined) updates.payment_methods = JSON.stringify(updates.payment_methods);
    if (updates.highlights      !== undefined) updates.highlights      = JSON.stringify(updates.highlights);

    // Re-vérifier qu'il reste des champs après les guards
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun champ valide à mettre à jour' });
    }

    // UPSERT
    const existing = await pool.query(
      'SELECT id FROM business_branding WHERE business_id = $1',
      [businessId]
    );

    let result;
    if (existing.rows.length === 0) {
      const fields       = ['business_id', ...Object.keys(updates)];
      const values       = [businessId,    ...Object.values(updates)];
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      result = await pool.query(
        `INSERT INTO business_branding (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
    } else {
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
      result = await pool.query(
        `UPDATE business_branding SET ${setClauses}, updated_at = NOW() WHERE business_id = $1 RETURNING *`,
        [businessId, ...Object.values(updates)]
      );
    }

    const branding = result.rows[0];
    branding.gallery_urls    = branding.gallery_urls    || [];
    branding.footer_links    = branding.footer_links    || [];
    branding.payment_methods = branding.payment_methods || [];

    return res.json({ success: true, data: branding });

  } catch (err) {
    console.error('[updateBranding]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── POST /api/branding/upload-logo ────────────────────────────────────────────
exports.uploadLogo = async (req, res) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business non trouvé' });

    const sub = await getBusinessSubscription(businessId);
    if (!sub || !sub.custom_branding) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ success: false, error: 'Upload logo nécessite un abonnement Premium', code: 'PREMIUM_REQUIRED' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier fourni' });

    const logoUrl = `/uploads/logos/${req.file.filename}`;

    // Supprimer l'ancien logo local
    const old = await pool.query('SELECT logo_url FROM business_branding WHERE business_id = $1', [businessId]);
    if (old.rows[0]?.logo_url?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '..', old.rows[0].logo_url), () => {});
    }

    await pool.query(
      `INSERT INTO business_branding (business_id, logo_url)
       VALUES ($1, $2)
       ON CONFLICT (business_id) DO UPDATE SET logo_url = $2, updated_at = NOW()`,
      [businessId, logoUrl]
    );

    return res.json({ success: true, data: { logo_url: logoUrl } });
  } catch (err) {
    console.error('[uploadLogo]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── POST /api/branding/upload-banner ─────────────────────────────────────────
// ✅ Bannière du profil — DISTINCT de cover_image_url
exports.uploadBanner = async (req, res) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business non trouvé' });

    const sub = await getBusinessSubscription(businessId);
    if (!sub || !sub.custom_branding) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ success: false, error: 'Upload bannière nécessite un abonnement Premium', code: 'PREMIUM_REQUIRED' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier fourni' });

    const bannerUrl = `/uploads/banners/${req.file.filename}`;
    const field = req.query.mobile === 'true' ? 'banner_mobile_url' : 'banner_url';

    // ✅ GUARD : vérifier que le fichier est bien dans /banners/ et pas /covers/
    if (!bannerUrl.startsWith('/uploads/banners/')) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, error: 'Chemin de fichier invalide pour une bannière' });
    }

    const old = await pool.query(`SELECT ${field} FROM business_branding WHERE business_id = $1`, [businessId]);
    if (old.rows[0]?.[field]?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '..', old.rows[0][field]), () => {});
    }

    await pool.query(
      `INSERT INTO business_branding (business_id, ${field})
       VALUES ($1, $2)
       ON CONFLICT (business_id) DO UPDATE SET ${field} = $2, updated_at = NOW()`,
      [businessId, bannerUrl]
    );

    return res.json({ success: true, data: { [field]: bannerUrl } });
  } catch (err) {
    console.error('[uploadBanner]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── POST /api/branding/upload-cover ──────────────────────────────────────────
// ✅ Accessible à TOUS les plans (pas de check Premium)
exports.uploadCover = async (req, res) => {
  try {
    const businessId = req.business?.id;

    console.log('[uploadCover] businessId:', businessId);
    console.log('[uploadCover] file:', req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'AUCUN');

    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business non trouvé' });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier reçu.',
      });
    }

    const coverUrl = `/uploads/covers/${req.file.filename}`;

    // Supprimer l'ancienne cover locale
    const old = await pool.query(
      'SELECT cover_image_url FROM business_branding WHERE business_id = $1',
      [businessId]
    );
    const oldUrl = old.rows[0]?.cover_image_url;
    if (oldUrl?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '..', oldUrl), (err) => {
        if (err) console.warn('[uploadCover] Impossible de supprimer ancienne cover:', err.message);
      });
    }

    // ✅ Upsert dans business_branding
    await pool.query(
      `INSERT INTO business_branding (business_id, cover_image_url)
       VALUES ($1, $2)
       ON CONFLICT (business_id) DO UPDATE 
       SET cover_image_url = EXCLUDED.cover_image_url, updated_at = NOW()`,
      [businessId, coverUrl]
    );

    // ✅ Vérifier que la colonne existe dans businesses avant de syncer
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'businesses' AND column_name = 'cover_image_url'`
    );

    if (colCheck.rows.length > 0) {
      await pool.query(
        `UPDATE businesses SET cover_image_url = $1, updated_at = NOW() WHERE id = $2`,
        [coverUrl, businessId]
      );
      console.log('[uploadCover] Sync businesses.cover_image_url OK:', coverUrl);
    } else {
      console.warn('[uploadCover] Colonne cover_image_url absente de businesses — migration manquante');
    }

    // ✅ Vérification finale
    const verify = await pool.query(
      'SELECT cover_image_url FROM business_branding WHERE business_id = $1',
      [businessId]
    );
    console.log('[uploadCover] Vérification branding:', verify.rows[0]?.cover_image_url);

    return res.json({ success: true, data: { cover_image_url: coverUrl } });
  } catch (err) {
    console.error('[uploadCover] ERREUR:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── PUT /api/branding/cover-url — Sans check Premium ─────────
exports.updateCoverUrl = async (req, res) => {
  try {
    const businessId = req.business.id;
    const { cover_image_url } = req.body;

    // ✅ Validation permissive : accepter les chemins relatifs ET les URLs externes
    if (cover_image_url !== null && cover_image_url !== undefined && cover_image_url !== '') {
      const isRelative = cover_image_url.startsWith('/');
      const isAbsolute = cover_image_url.startsWith('http://') || cover_image_url.startsWith('https://');
      if (!isRelative && !isAbsolute) {
        return res.status(400).json({ success: false, error: 'URL invalide' });
      }
    }

    const url = cover_image_url || null;

    // Upsert dans business_branding
    await pool.query(
      `INSERT INTO business_branding (business_id, cover_image_url)
       VALUES ($1, $2)
       ON CONFLICT (business_id) DO UPDATE 
       SET cover_image_url = EXCLUDED.cover_image_url, updated_at = NOW()`,
      [businessId, url]
    );

    // Synchroniser vers businesses
    await pool.query(
      `UPDATE businesses SET cover_image_url = $1, updated_at = NOW() WHERE id = $2`,
      [url, businessId]
    );

    console.log('[updateCoverUrl] Saved:', url, 'for business:', businessId);
    return res.json({ success: true, data: { cover_image_url: url } });
  } catch (err) {
    console.error('[updateCoverUrl]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── POST /api/branding/upload-gallery ────────────────────────────────────────
exports.uploadGalleryPhoto = async (req, res) => {
  try {
    const businessId = req.business?.id;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business non trouvé' });

    const sub = await getBusinessSubscription(businessId);
    if (!sub || !sub.custom_branding) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).json({ success: false, error: 'Upload galerie nécessite un abonnement Premium', code: 'PREMIUM_REQUIRED' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier fourni' });

    const photoUrl = `/uploads/gallery/${req.file.filename}`;

    const existing = await pool.query('SELECT gallery_urls FROM business_branding WHERE business_id = $1', [businessId]);
    const currentUrls = existing.rows[0]?.gallery_urls || [];

    const planResult = await pool.query(
      `SELECT sp.max_photos FROM subscription_plans sp
       JOIN business_subscriptions bs ON sp.id = bs.plan_id
       WHERE bs.business_id = $1 AND bs.status = 'active' LIMIT 1`,
      [businessId]
    );
    const maxPhotos = planResult.rows[0]?.max_photos ?? 50;

    if (currentUrls.length >= maxPhotos) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, error: `Maximum ${maxPhotos} photos atteint pour votre plan` });
    }

    const updatedUrls = [...currentUrls, photoUrl];

    await pool.query(
      `INSERT INTO business_branding (business_id, gallery_urls)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (business_id) DO UPDATE SET gallery_urls = $2::jsonb, updated_at = NOW()`,
      [businessId, JSON.stringify(updatedUrls)]
    );

    return res.json({ success: true, data: { photo_url: photoUrl, gallery_urls: updatedUrls } });
  } catch (err) {
    console.error('[uploadGalleryPhoto]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── DELETE /api/branding/gallery ─────────────────────────────────────────────
exports.deleteGalleryPhoto = async (req, res) => {
  try {
    const businessId = req.business?.id;
    const { url }    = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL requise' });

    const existing    = await pool.query('SELECT gallery_urls FROM business_branding WHERE business_id = $1', [businessId]);
    const currentUrls = existing.rows[0]?.gallery_urls || [];
    const updatedUrls = currentUrls.filter((u) => u !== url);

    await pool.query(
      `UPDATE business_branding SET gallery_urls = $2::jsonb, updated_at = NOW() WHERE business_id = $1`,
      [businessId, JSON.stringify(updatedUrls)]
    );

    if (url.startsWith('/uploads/')) fs.unlink(path.join(__dirname, '..', url), () => {});

    return res.json({ success: true, data: { gallery_urls: updatedUrls } });
  } catch (err) {
    console.error('[deleteGalleryPhoto]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ── DELETE /api/branding — Réinitialiser ─────────────────────────────────────
exports.deleteBranding = async (req, res) => {
  try {
    const businessId = req.business?.id;
    await pool.query('DELETE FROM business_branding WHERE business_id = $1', [businessId]);
    // Réinitialiser aussi cover_image_url dans businesses
    await pool.query('UPDATE businesses SET cover_image_url = NULL WHERE id = $1', [businessId]);
    return res.json({ success: true, message: 'Branding réinitialisé', data: DEFAULT_BRANDING });
  } catch (err) {
    console.error('[deleteBranding]', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};