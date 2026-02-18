const pool = require('../config/db');

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
    return result.rows[0];
  }

  static async getByCategory(category) {
    const result = await pool.query(
      'SELECT * FROM app_settings WHERE category = $1 ORDER BY key',
      [category]
    );
    return result.rows;
  }

  static async getValue(key) {
    const setting = await this.getByKey(key);
    if (!setting) return null;

    switch (setting.value_type) {
      case 'number':
        return parseFloat(setting.value);
      case 'boolean':
        return setting.value === 'true';
      case 'json':
        return JSON.parse(setting.value);
      default:
        return setting.value;
    }
  }

  static async setValue(key, value, valueType = 'string') {
    let stringValue = value;
    
    if (valueType === 'json') {
      stringValue = JSON.stringify(value);
    } else if (valueType === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (valueType === 'number') {
      stringValue = value.toString();
    }

    const result = await pool.query(
      `INSERT INTO app_settings (key, value, value_type) 
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE 
       SET value = $2, value_type = $3
       RETURNING *`,
      [key, stringValue, valueType]
    );
    return result.rows[0];
  }

  static async update(key, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updateData).forEach(field => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(updateData[field]);
        paramCount++;
      }
    });

    values.push(key);
    const result = await pool.query(
      `UPDATE app_settings SET ${fields.join(', ')} WHERE key = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(key) {
    const result = await pool.query(
      'DELETE FROM app_settings WHERE key = $1 RETURNING *',
      [key]
    );
    return result.rows[0];
  }
}

module.exports = AppSetting;