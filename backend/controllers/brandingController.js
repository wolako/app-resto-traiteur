// controllers/brandingController.js

const { pool } = require('../config/db');

/**
 * Récupérer l'abonnement actif d'un business
 */
async function getBusinessSubscription(businessId) {
  const result = await pool.query(
    `SELECT bs.*, sp.custom_branding
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     WHERE bs.business_id = $1 AND bs.status = 'active'
     ORDER BY bs.created_at DESC
     LIMIT 1`,
    [businessId]
  );
  
  return result.rows[0];
}

/**
 * Obtenir le branding d'un business
 * GET /api/branding/:businessId
 */
const getBranding = async (req, res) => {
  try {
    const { businessId } = req.params;

    const result = await pool.query(
      'SELECT * FROM business_branding WHERE business_id = $1',
      [businessId]
    );

    // Si pas de branding, retourner les valeurs par défaut
    const branding = result.rows[0] || {
      business_id: businessId,
      primary_color: '#0d6efd',
      secondary_color: '#6c757d',
      accent_color: '#ffc107',
      logo_url: null,
      logo_square_url: null,
      footer_text: null,
      footer_links: [],
      custom_domain: null
    };

    res.json({
      success: true,
      data: branding
    });
  } catch (error) {
    console.error('❌ Erreur récupération branding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
};

/**
 * Mettre à jour le branding (Premium uniquement)
 * PUT /api/branding
 */
const updateBranding = async (req, res) => {
  try {
    const businessId = req.business.id;
    const { 
      primary_color, 
      secondary_color, 
      accent_color, 
      logo_url,
      logo_square_url,
      footer_text, 
      footer_links,
      custom_domain
    } = req.body;

    // ✅ Vérifier si le business a le branding personnalisé
    const subscription = await getBusinessSubscription(businessId);
    
    if (!subscription?.custom_branding) {
      return res.status(403).json({
        success: false,
        error: 'Le branding personnalisé nécessite le plan Premium.',
        upgrade_required: true
      });
    }

    // Validation des couleurs (format #RRGGBB)
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    
    if (primary_color && !colorRegex.test(primary_color)) {
      return res.status(400).json({
        success: false,
        error: 'Couleur principale invalide (format: #RRGGBB)'
      });
    }

    if (secondary_color && !colorRegex.test(secondary_color)) {
      return res.status(400).json({
        success: false,
        error: 'Couleur secondaire invalide (format: #RRGGBB)'
      });
    }

    if (accent_color && !colorRegex.test(accent_color)) {
      return res.status(400).json({
        success: false,
        error: 'Couleur d\'accentuation invalide (format: #RRGGBB)'
      });
    }

    // Validation des URLs (basique)
    const urlRegex = /^https?:\/\/.+/;
    
    if (logo_url && !urlRegex.test(logo_url)) {
      return res.status(400).json({
        success: false,
        error: 'URL du logo invalide'
      });
    }

    if (logo_square_url && !urlRegex.test(logo_square_url)) {
      return res.status(400).json({
        success: false,
        error: 'URL du logo carré invalide'
      });
    }

    // Validation des footer_links
    let validatedFooterLinks = [];
    if (footer_links) {
      if (!Array.isArray(footer_links)) {
        return res.status(400).json({
          success: false,
          error: 'footer_links doit être un tableau'
        });
      }

      for (const link of footer_links) {
        if (!link.text || !link.url) {
          return res.status(400).json({
            success: false,
            error: 'Chaque lien doit avoir un text et une url'
          });
        }
        validatedFooterLinks.push({
          text: link.text,
          url: link.url
        });
      }
    }

    // Insérer ou mettre à jour
    const result = await pool.query(
      `INSERT INTO business_branding 
       (business_id, primary_color, secondary_color, accent_color, logo_url, logo_square_url, footer_text, footer_links, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (business_id) 
       DO UPDATE SET
         primary_color = COALESCE($2, business_branding.primary_color),
         secondary_color = COALESCE($3, business_branding.secondary_color),
         accent_color = COALESCE($4, business_branding.accent_color),
         logo_url = COALESCE($5, business_branding.logo_url),
         logo_square_url = COALESCE($6, business_branding.logo_square_url),
         footer_text = COALESCE($7, business_branding.footer_text),
         footer_links = COALESCE($8, business_branding.footer_links),
         custom_domain = COALESCE($9, business_branding.custom_domain),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        businessId, 
        primary_color || null,
        secondary_color || null,
        accent_color || null,
        logo_url || null,
        logo_square_url || null,
        footer_text || null,
        validatedFooterLinks.length > 0 ? JSON.stringify(validatedFooterLinks) : null,
        custom_domain || null
      ]
    );

    console.log(`✅ Branding mis à jour pour business #${businessId}`);

    res.json({
      success: true,
      message: 'Branding mis à jour avec succès',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour branding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
};

/**
 * Supprimer le branding (réinitialiser aux valeurs par défaut)
 * DELETE /api/branding
 */
const deleteBranding = async (req, res) => {
  try {
    const businessId = req.business.id;

    const result = await pool.query(
      'DELETE FROM business_branding WHERE business_id = $1 RETURNING *',
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Aucun branding à supprimer'
      });
    }

    console.log(`✅ Branding supprimé pour business #${businessId}`);

    res.json({
      success: true,
      message: 'Branding réinitialisé aux valeurs par défaut',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur suppression branding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
};

module.exports = {
  getBranding,
  updateBranding,
  deleteBranding
};