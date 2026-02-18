const { pool } = require('../config/db');

class Reservation {
  static async findById(id) {
    const result = await pool.query(
      `SELECT r.*, b.name as restaurant_name
       FROM reservations r
       JOIN businesses b ON r.restaurant_id = b.id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async create(reservationData) {
    const {
      restaurant_id,
      client_id,
      client_name,
      client_phone,
      client_email,
      reservation_date,
      time_slot,
      number_of_people,
      special_requests
    } = reservationData;

    const result = await pool.query(
      `INSERT INTO reservations 
       (restaurant_id, client_id, client_name, client_phone, client_email, 
        reservation_date, time_slot, number_of_people, special_requests, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        restaurant_id,
        client_id || null,
        client_name, 
        client_phone, 
        client_email,
        reservation_date, 
        time_slot, 
        number_of_people, 
        special_requests, 
        'pending'
      ]
    );

    return result.rows[0];
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE reservations SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  static async getByRestaurantId(restaurantId, filters = {}) {
    let query = `
      SELECT r.*, b.name as restaurant_name
      FROM reservations r
      JOIN businesses b ON r.restaurant_id = b.id
      WHERE r.restaurant_id = $1
    `;

    const values = [restaurantId];
    let paramCount = 2;

    if (filters.status) {
      query += ` AND r.status = ${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.date) {
      query += ` AND r.reservation_date = ${paramCount}`;
      values.push(filters.date);
      paramCount++;
    }

    query += ` ORDER BY r.reservation_date DESC, r.time_slot DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async checkAvailability(restaurantId, date, timeSlot) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM reservations
       WHERE restaurant_id = $1 
       AND reservation_date = $2 
       AND time_slot = $3 
       AND status != 'cancelled'`,
      [restaurantId, date, timeSlot]
    );

    return parseInt(result.rows[0].count) === 0;
  }

  static async getAvailableTimeSlots(restaurantId, date) {
    try {
      // Récupérer les heures d'ouverture du restaurant
      const businessResult = await pool.query(
        'SELECT opening_hour, closing_hour FROM businesses WHERE id = $1 AND type = $2 AND is_active = true',
        [restaurantId, 'restaurant']
      );

      if (businessResult.rows.length === 0) {
        console.log('Restaurant not found or not active');
        return [];
      }

      const business = businessResult.rows[0];
      
      console.log('Business hours from DB:', {
        opening_hour: business.opening_hour,
        closing_hour: business.closing_hour
      });

      // Fonction pour convertir TIME PostgreSQL en HH:MM
      const formatTime = (timeValue) => {
        if (!timeValue) return null;
        
        if (typeof timeValue === 'string') {
          const parts = timeValue.split(':');
          return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        
        return null;
      };

      const opening_hour = formatTime(business.opening_hour);
      const closing_hour = formatTime(business.closing_hour);

      if (!opening_hour || !closing_hour) {
        console.error('Invalid opening/closing hours:', {
          opening_hour: business.opening_hour,
          closing_hour: business.closing_hour
        });
        return [];
      }

      console.log('Formatted hours:', { opening_hour, closing_hour });

      // Récupérer les créneaux déjà réservés (non annulés)
      const reservedResult = await pool.query(
        `SELECT time_slot
        FROM reservations
        WHERE restaurant_id = $1 
        AND reservation_date = $2 
        AND status != 'cancelled'`,
        [restaurantId, date]
      );

      const reservedSlots = reservedResult.rows.map(row => row.time_slot);
      console.log('Reserved slots for date:', date, reservedSlots);

      // Générer les créneaux disponibles (toutes les 30 minutes)
      const availableSlots = [];
      
      // Convertir les heures en minutes depuis minuit
      const [startHours, startMinutes] = opening_hour.split(':').map(Number);
      const [endHours, endMinutes] = closing_hour.split(':').map(Number);
      
      if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes)) {
        console.error('Invalid time parsing:', { opening_hour, closing_hour });
        return [];
      }
      
      let startTotalMinutes = startHours * 60 + startMinutes;
      let endTotalMinutes = endHours * 60 + endMinutes;

      // ⚠️ GESTION DES HORAIRES APRÈS MINUIT
      // Si l'heure de fermeture est avant l'heure d'ouverture, 
      // cela signifie que le restaurant ferme après minuit (le lendemain)
      if (endTotalMinutes < startTotalMinutes) {
        // Ajouter 24h (1440 minutes) à l'heure de fermeture
        endTotalMinutes += 1440;
        console.log('⏰ Restaurant ferme après minuit, ajustement effectué');
      }

      console.log('Time range in minutes:', { 
        start: startTotalMinutes, 
        end: endTotalMinutes 
      });

      // Générer les créneaux de 30 minutes
      for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
        // Normaliser les minutes pour qu'elles restent dans la journée (0-1439)
        const normalizedMinutes = minutes % 1440;
        const hours = Math.floor(normalizedMinutes / 60);
        const mins = normalizedMinutes % 60;
        const timeSlot = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        
        // Vérifier que le créneau n'est pas déjà réservé
        if (!reservedSlots.includes(timeSlot)) {
          availableSlots.push(timeSlot);
        }
      }

      console.log('Generated available slots:', availableSlots.length, 'slots');
      console.log('First slots:', availableSlots.slice(0, 5));
      console.log('Last slots:', availableSlots.slice(-5));
      
      return availableSlots;

    } catch (error) {
      console.error('Error in getAvailableTimeSlots:', error);
      return [];
    }
  }

  static async getStatistics(restaurantId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(*) FILTER (WHERE DATE(reservation_date) = CURRENT_DATE) as today_reservations,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_reservations,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_reservations
      FROM reservations
    `;

    const values = [];
    
    if (restaurantId) {
      query += ' WHERE restaurant_id = $1';
      values.push(restaurantId);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT r.*, b.name as restaurant_name
      FROM reservations r
      JOIN businesses b ON r.restaurant_id = b.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND r.status = ${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = Reservation;

