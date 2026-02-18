// scripts/fix-encoding-complete.js
// Script pour corriger l'encodage UTF-8 dans toute la base de données
// Corrige le problème de double encodage (fidÃ©litÃ© → fidélité)

const { Pool } = require('pg');
require('dotenv').config();

// Créer une instance de pool avec la configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'restotraiteur',
  user: process.env.DB_USER || 'restotraiteur_dbadmin',
  password: process.env.DB_PASSWORD || 'monrestotraiteur_2025',
});

/**
 * Fonction pour décoder le double encodage UTF-8
 * Convertit "fidÃ©litÃ©" en "fidélité"
 */
function fixDoubleEncoding(text) {
  if (!text || typeof text !== 'string') return text;
  
  try {
    // Vérifier si le texte contient des caractères mal encodés
    if (text.includes('Ã©') || text.includes('Ã¨') || text.includes('Ã ') || 
        text.includes('Ãª') || text.includes('Ã§') || text.includes('Ã´')) {
      
      // Encoder en latin1 puis décoder en UTF-8
      const buffer = Buffer.from(text, 'latin1');
      return buffer.toString('utf8');
    }
    return text;
  } catch (error) {
    console.warn(`Erreur décodage pour "${text}":`, error.message);
    return text;
  }
}

const fixCompleteEncoding = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Début de la correction complète de l\'encodage UTF-8...\n');
    
    // 1. Forcer UTF-8
    await client.query('SET CLIENT_ENCODING TO \'UTF8\'');
    console.log('✅ Encodage forcé à UTF-8\n');
    
    // 2. Vérifier l'encodage
    const encodingCheck = await client.query(
      'SELECT current_setting(\'server_encoding\') as server, current_setting(\'client_encoding\') as client'
    );
    console.log('📋 Encodages:');
    console.log('   Serveur:', encodingCheck.rows[0].server);
    console.log('   Client:', encodingCheck.rows[0].client);
    console.log('');
    
    // 3. Corriger les plans d'abonnement
    console.log('💎 Correction des plans d\'abonnement...');
    const plansUpdates = [
      { name: 'free', display_name: 'Gratuit', description: 'Plan de base pour démarrer' },
      { name: 'standard', display_name: 'Standard', description: 'Pour les établissements en croissance' },
      { name: 'premium', display_name: 'Premium', description: 'Pour les établissements établis' },
      { name: 'standard_yearly', display_name: 'Standard Annuel', description: 'Pour les établissements en croissance - Facturation annuelle' },
      { name: 'premium_yearly', display_name: 'Premium Annuel', description: 'Pour les établissements établis - Facturation annuelle' }
    ];
    
    for (const plan of plansUpdates) {
      const result = await client.query(
        'UPDATE subscription_plans SET display_name = $1, description = $2 WHERE name = $3 RETURNING name',
        [plan.display_name, plan.description, plan.name]
      );
      if (result.rows.length > 0) {
        console.log(`   ✅ ${plan.name} → ${plan.display_name}`);
      }
    }
    console.log('');
    
    // 4. Corriger les paramètres de l'application
    console.log('⚙️  Correction des paramètres de l\'application...');
    
    // D'abord, lire tous les paramètres
    const allSettings = await client.query('SELECT * FROM app_settings');
    
    let correctedCount = 0;
    for (const setting of allSettings.rows) {
      let needsUpdate = false;
      const updates = {};
      
      // Corriger la description si elle a un double encodage
      if (setting.description) {
        const fixedDescription = fixDoubleEncoding(setting.description);
        if (fixedDescription !== setting.description) {
          updates.description = fixedDescription;
          needsUpdate = true;
        }
      }
      
      // Corriger la valeur si elle a un double encodage
      if (setting.value && setting.value_type === 'string') {
        const fixedValue = fixDoubleEncoding(setting.value);
        if (fixedValue !== setting.value) {
          updates.value = fixedValue;
          needsUpdate = true;
        }
      }
      
      // Appliquer les corrections
      if (needsUpdate) {
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        if (updates.description) {
          fields.push(`description = $${paramCount}`);
          values.push(updates.description);
          paramCount++;
        }
        
        if (updates.value) {
          fields.push(`value = $${paramCount}`);
          values.push(updates.value);
          paramCount++;
        }
        
        if (fields.length > 0) {
          values.push(setting.key);
          await client.query(
            `UPDATE app_settings SET ${fields.join(', ')} WHERE key = $${paramCount}`,
            values
          );
          console.log(`   ✅ ${setting.key}`);
          correctedCount++;
        }
      }
    }
    
    console.log(`   📊 ${correctedCount} paramètres corrigés\n`);
    
    // 5. Ajouter/corriger les paramètres manquants avec les bonnes descriptions
    console.log('📝 Ajout/correction des paramètres essentiels...');
    
    const essentialSettings = [
      { key: 'app_name', value: 'RestoTraiteur', value_type: 'string', category: 'general', description: 'Nom de l\'application', is_public: true },
      { key: 'app_tagline', value: 'Votre plateforme de commande en ligne', value_type: 'string', category: 'general', description: 'Slogan de l\'application', is_public: true },
      { key: 'maintenance_mode', value: 'false', value_type: 'boolean', category: 'general', description: 'Mode maintenance de l\'application', is_public: false },
      { key: 'maintenance_message', value: 'L\'application est actuellement en maintenance. Veuillez réessayer dans quelques instants.', value_type: 'string', category: 'general', description: 'Message affiché pendant la maintenance', is_public: true },
      { key: 'maintenance_end_time', value: '', value_type: 'string', category: 'general', description: 'Heure de fin prévue de la maintenance (format: HH:MM)', is_public: true },
      { key: 'allow_new_registrations', value: 'true', value_type: 'boolean', category: 'general', description: 'Autoriser les nouvelles inscriptions', is_public: false },
      { key: 'default_commission_rate', value: '5.00', value_type: 'number', category: 'commissions', description: 'Taux de commission par défaut (%)', is_public: false },
      { key: 'min_commission_amount', value: '100', value_type: 'number', category: 'commissions', description: 'Montant minimum de commission (XOF)', is_public: false },
      { key: 'min_order_amount', value: '1000', value_type: 'number', category: 'orders', description: 'Montant minimum de commande (XOF)', is_public: true },
      { key: 'max_order_amount', value: '500000', value_type: 'number', category: 'orders', description: 'Montant maximum de commande (XOF)', is_public: true },
      { key: 'order_cancellation_time', value: '30', value_type: 'number', category: 'orders', description: 'Délai d\'annulation de commande (minutes)', is_public: true },
      { key: 'max_reservation_people', value: '20', value_type: 'number', category: 'reservations', description: 'Nombre maximum de personnes par réservation', is_public: true },
      { key: 'reservation_advance_days', value: '30', value_type: 'number', category: 'reservations', description: 'Jours à l\'avance pour réserver', is_public: true },
      { key: 'payment_methods', value: '["Mixx By Yas", "flooz"]', value_type: 'json', category: 'payments', description: 'Méthodes de paiement disponibles', is_public: true },
      { key: 'currency', value: 'XOF', value_type: 'string', category: 'payments', description: 'Devise par défaut', is_public: true },
      { key: 'support_email', value: 'support@restotraiteur.com', value_type: 'string', category: 'contact', description: 'Email de support', is_public: true },
      { key: 'contact_phone', value: '+228 90 00 00 00', value_type: 'string', category: 'contact', description: 'Téléphone de contact', is_public: true },
      { key: 'enable_reviews', value: 'true', value_type: 'boolean', category: 'features', description: 'Activer les avis clients', is_public: true },
      { key: 'enable_loyalty_program', value: 'false', value_type: 'boolean', category: 'features', description: 'Activer le programme de fidélité', is_public: true },
      { key: 'enable_referral_program', value: 'false', value_type: 'boolean', category: 'features', description: 'Activer le parrainage', is_public: true },
      { key: 'max_login_attempts', value: '5', value_type: 'number', category: 'security', description: 'Nombre maximum de tentatives de connexion avant blocage', is_public: false },
      { key: 'session_timeout', value: '7200', value_type: 'number', category: 'security', description: 'Durée de session en secondes (2 heures par défaut)', is_public: false },
      { key: 'enable_email_notifications', value: 'true', value_type: 'boolean', category: 'notifications', description: 'Activer les notifications par email', is_public: false },
      { key: 'enable_sms_notifications', value: 'false', value_type: 'boolean', category: 'notifications', description: 'Activer les notifications par SMS', is_public: false },
      { key: 'max_file_size', value: '5242880', value_type: 'number', category: 'uploads', description: 'Taille maximale des fichiers en octets (5 MB par défaut)', is_public: true },
      { key: 'allowed_file_types', value: '["image/jpeg", "image/png", "image/webp", "application/pdf"]', value_type: 'json', category: 'uploads', description: 'Types de fichiers autorisés', is_public: true },
      { key: 'cache_enabled', value: 'true', value_type: 'boolean', category: 'performance', description: 'Activer le cache de l\'application', is_public: false },
      { key: 'cache_duration', value: '3600', value_type: 'number', category: 'performance', description: 'Durée du cache en secondes (1 heure par défaut)', is_public: false }
    ];
    
    for (const setting of essentialSettings) {
      await client.query(`
        INSERT INTO app_settings (key, value, value_type, category, description, is_public)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          value_type = EXCLUDED.value_type,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          is_public = EXCLUDED.is_public
      `, [setting.key, setting.value, setting.value_type, setting.category, setting.description, setting.is_public]);
      console.log(`   ✅ ${setting.key}`);
    }
    console.log('');
    
    // 6. Corriger l'encodage des établissements
    console.log('🏢 Correction des établissements...');
    const businesses = await client.query('SELECT id, name, description, address FROM businesses WHERE name IS NOT NULL');
    
    let businessCount = 0;
    for (const business of businesses.rows) {
      const fixedName = fixDoubleEncoding(business.name);
      const fixedDescription = fixDoubleEncoding(business.description);
      const fixedAddress = fixDoubleEncoding(business.address);
      
      if (fixedName !== business.name || fixedDescription !== business.description || fixedAddress !== business.address) {
        await client.query(
          'UPDATE businesses SET name = $1, description = $2, address = $3 WHERE id = $4',
          [fixedName, fixedDescription, fixedAddress, business.id]
        );
        businessCount++;
      }
    }
    console.log(`   ✅ ${businessCount} établissements corrigés`);
    console.log('');
    
    // 7. Corriger l'encodage des menus et items
    console.log('🍽️  Correction des menus et items...');
    const menus = await client.query('SELECT id, name, description FROM menus WHERE name IS NOT NULL');
    
    let menuCount = 0;
    for (const menu of menus.rows) {
      const fixedName = fixDoubleEncoding(menu.name);
      const fixedDescription = fixDoubleEncoding(menu.description);
      
      if (fixedName !== menu.name || fixedDescription !== menu.description) {
        await client.query(
          'UPDATE menus SET name = $1, description = $2 WHERE id = $3',
          [fixedName, fixedDescription, menu.id]
        );
        menuCount++;
      }
    }
    console.log(`   ✅ ${menuCount} menus corrigés`);
    
    const items = await client.query('SELECT id, name, description FROM menu_items WHERE name IS NOT NULL');
    
    let itemCount = 0;
    for (const item of items.rows) {
      const fixedName = fixDoubleEncoding(item.name);
      const fixedDescription = fixDoubleEncoding(item.description);
      
      if (fixedName !== item.name || fixedDescription !== item.description) {
        await client.query(
          'UPDATE menu_items SET name = $1, description = $2 WHERE id = $3',
          [fixedName, fixedDescription, item.id]
        );
        itemCount++;
      }
    }
    console.log(`   ✅ ${itemCount} items corrigés`);
    console.log('');
    
    // 8. Vérification finale
    console.log('🔍 Vérification finale...');
    const plansCheck = await client.query(
      'SELECT name, display_name, description FROM subscription_plans ORDER BY sort_order'
    );
    
    console.log('\n📊 Plans d\'abonnement:');
    plansCheck.rows.forEach(plan => {
      console.log(`   • ${plan.display_name}`);
      console.log(`     ${plan.description}`);
    });
    
    const settingsCheck = await client.query(
      'SELECT key, description FROM app_settings WHERE description LIKE \'%é%\' OR description LIKE \'%è%\' ORDER BY key LIMIT 5'
    );
    
    console.log('\n📋 Exemples de paramètres avec accents:');
    settingsCheck.rows.forEach(setting => {
      console.log(`   • ${setting.key}: ${setting.description}`);
    });
    
    // Test d'encodage
    const testResult = await client.query(
      "SELECT 'Caractères spéciaux: é è ê à â ù û ç œ Œ' as test"
    );
    console.log('\n✅ Test encodage UTF-8:');
    console.log(`   ${testResult.rows[0].test}`);
    
    console.log('\n✨ Correction de l\'encodage terminée avec succès!\n');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// Exécuter le script
fixCompleteEncoding()
  .then(() => {
    console.log('✅ Script terminé\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });