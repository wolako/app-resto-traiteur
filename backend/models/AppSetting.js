const { pool } = require('../config/db');

class AppSetting {
  static async getAll(isPublic = null) {
    let query = 'SELECT * FROM app_settings';
    const params = [];

    if (isPublic !== null) {
      query += ' WHERE is_public = $1';
      params.push(isPublic);
    }

    query += ' ORDER BY category, key';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getByKey(key) {
    const result = await pool.query(
      'SELECT * FROM app_settings WHERE key = $1',
      [key]
    );
    return result.rows[0] || null;
  }

  static async getByCategory(category) {
    const result = await pool.query(
      'SELECT * FROM app_settings WHERE category = $1 ORDER BY key',
      [category]
    );
    return result.rows;
  }

  static async getValue(key, defaultValue = null) {
    const setting = await this.getByKey(key);
    if (!setting) return defaultValue; // ✅ retourne le défaut si clé absente
  
    switch (setting.value_type) {
      case 'number':  return parseFloat(setting.value);
      case 'boolean': return setting.value === 'true';
      case 'json':
        try { return JSON.parse(setting.value); } catch { return defaultValue; }
      default: return setting.value;
    }
  }

  // ✅ Récupérer plusieurs clés en UNE seule requête SQL
  static async getMultipleValues(keys) {
    if (!keys || keys.length === 0) return {};
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `SELECT key, value, value_type FROM app_settings WHERE key IN (${placeholders})`,
      keys
    );
    const map = {};
    for (const row of result.rows) {
      switch (row.value_type) {
        case 'number':  map[row.key] = parseFloat(row.value); break;
        case 'boolean': map[row.key] = row.value === 'true';  break;
        case 'json':    map[row.key] = JSON.parse(row.value); break;
        default:        map[row.key] = row.value;
      }
    }
    return map;
  }

  static async setValue(key, value, valueType = 'string') {
    let stringValue;
    switch (valueType) {
      case 'json':    stringValue = typeof value === 'string' ? value : JSON.stringify(value); break;
      case 'boolean': stringValue = value ? 'true' : 'false'; break;
      case 'number':  stringValue = String(value); break;
      default:        stringValue = String(value);
    }

    const result = await pool.query(
      `INSERT INTO app_settings (key, value, value_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE
         SET value = $2, value_type = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [key, stringValue, valueType]
    );
    return result.rows[0];
  }

  static async update(key, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [field, val] of Object.entries(updateData)) {
      if (val !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(val);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(key);

    const result = await pool.query(
      `UPDATE app_settings SET ${fields.join(', ')} WHERE key = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async delete(key) {
    const result = await pool.query(
      'DELETE FROM app_settings WHERE key = $1 RETURNING *',
      [key]
    );
    return result.rows[0] || null;
  }
}

module.exports = AppSetting;