// ========================================
// OPTION 1 : AVEC SEQUELIZE
// ========================================
// backend/models/testimonial.model.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Testimonial = sequelize.define('Testimonial', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5
      }
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [50, 500]
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
      allowNull: false
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_featured'
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_name'
    },
    displayPhoto: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'display_photo'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    }
  }, {
    tableName: 'testimonials',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['is_featured'],
        where: { is_featured: true }
      },
      {
        unique: true,
        fields: ['user_id']
      }
    ]
  });

  // Associations
  Testimonial.associate = (models) => {
    Testimonial.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Testimonial;
};

// ========================================
// OPTION 2 : AVEC REQUÊTES SQL BRUTES (pg/mysql2)
// ========================================
// backend/models/testimonial.model.js

class TestimonialModel {
  constructor(db) {
    this.db = db;
  }

  async findAll(filters = {}) {
    let query = `
      SELECT 
        t.*,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.photo
      FROM testimonials t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`t.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.isFeatured !== undefined) {
      conditions.push(`t.is_featured = $${paramIndex}`);
      params.push(filters.isFeatured);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async findByUserId(userId) {
    const query = `
      SELECT 
        t.*,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.photo
      FROM testimonials t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id = $1
    `;
    
    const result = await this.db.query(query, [userId]);
    return result.rows[0] || null;
  }

  async findById(id) {
    const query = `
      SELECT 
        t.*,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.photo
      FROM testimonials t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `;
    
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    const query = `
      INSERT INTO testimonials (
        user_id, rating, comment, status, 
        display_name, display_photo
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const params = [
      data.userId,
      data.rating,
      data.comment,
      data.status || 'pending',
      data.displayName || null,
      data.displayPhoto || null
    ];

    const result = await this.db.query(query, params);
    return result.rows[0];
  }

  async update(id, data) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (data.rating !== undefined) {
      fields.push(`rating = $${paramIndex}`);
      params.push(data.rating);
      paramIndex++;
    }

    if (data.comment !== undefined) {
      fields.push(`comment = $${paramIndex}`);
      params.push(data.comment);
      paramIndex++;
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      params.push(data.status);
      paramIndex++;
    }

    if (data.isFeatured !== undefined) {
      fields.push(`is_featured = $${paramIndex}`);
      params.push(data.isFeatured);
      paramIndex++;
    }

    if (data.displayName !== undefined) {
      fields.push(`display_name = $${paramIndex}`);
      params.push(data.displayName);
      paramIndex++;
    }

    if (data.displayPhoto !== undefined) {
      fields.push(`display_photo = $${paramIndex}`);
      params.push(data.displayPhoto);
      paramIndex++;
    }

    if (data.rejectionReason !== undefined) {
      fields.push(`rejection_reason = $${paramIndex}`);
      params.push(data.rejectionReason);
      paramIndex++;
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE testimonials 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(query, params);
    return result.rows[0];
  }

  async delete(id) {
    const query = 'DELETE FROM testimonials WHERE id = $1';
    await this.db.query(query, [id]);
  }

  async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_featured = true) as featured,
        ROUND(AVG(rating) FILTER (WHERE status = 'approved'), 1) as average_rating
      FROM testimonials
    `;
    
    const result = await this.db.query(query);
    return result.rows[0];
  }
}

module.exports = TestimonialModel;