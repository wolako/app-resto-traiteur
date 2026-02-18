-- ========================================
-- Script d'initialisation PostgreSQL
-- Base de données: restotraiteur
-- VERSION CORRIGÉE : Support avis invités natif
-- ========================================

SET CLIENT_ENCODING TO 'UTF8';

-- ========================================
-- EXTENSIONS
-- ========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- FONCTION DE MISE À JOUR AUTOMATIQUE
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TABLES PRINCIPALES
-- ========================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('client', 'restaurant', 'traiteur', 'superadmin')) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS businesses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('restaurant', 'traiteur')) NOT NULL,
    description TEXT,
    address TEXT,
    phone VARCHAR(20),
    opening_hour TIME,
    closing_hour TIME,
    availability_start TIME,
    availability_end TIME,
    is_available BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    -- ✅ Colonnes de notation (calculées automatiquement par trigger)
    average_rating DECIMAL(2,1) DEFAULT 0,
    reviews_count  INTEGER      DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_hours_check CHECK (
        (type = 'restaurant' AND opening_hour IS NOT NULL AND closing_hour IS NOT NULL) OR
        (type = 'traiteur' AND availability_start IS NOT NULL AND availability_end IS NOT NULL) OR
        (opening_hour IS NULL AND closing_hour IS NULL AND availability_start IS NULL AND availability_end IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS menus (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    menu_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    category VARCHAR(100),
    is_available BOOLEAN DEFAULT true,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLES DE COMMANDES
-- ========================================

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_email VARCHAR(255),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')) DEFAULT 'pending',
    payment_status VARCHAR(20) CHECK (payment_status IN ('pending', 'paid', 'failed')) DEFAULT 'pending',
    payment_method VARCHAR(20) CHECK (payment_method IN ('Mixx By Yas','flooz')),
    delivery_confirmed BOOLEAN DEFAULT false,
    delivery_confirmed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS special_orders (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    number_of_guests INTEGER NOT NULL,
    delivery_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    menu_preferences TEXT NOT NULL,
    dietary_restrictions TEXT,
    special_requests TEXT,
    estimated_budget DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLES DE RÉSERVATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_email VARCHAR(255),
    reservation_date DATE NOT NULL,
    time_slot TIME NOT NULL,
    number_of_people INTEGER NOT NULL CHECK (number_of_people > 0 AND number_of_people <= 20),
    status VARCHAR(20) CHECK (status IN ('pending','confirmed','cancelled')) DEFAULT 'pending',
    special_requests TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_reservation UNIQUE (restaurant_id, reservation_date, time_slot)
);

-- ========================================
-- TABLES DE PAIEMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    payment_id VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'XOF',
    payment_method VARCHAR(20) CHECK (payment_method IN ('Mixx By Yas','flooz')) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending','success','failed')) DEFAULT 'pending',
    transaction_id VARCHAR(255),
    gateway_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLES D'AUTHENTIFICATION ET SÉCURITÉ
-- ========================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLES DE NOTIFICATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'new_order','new_reservation','payment_success','payment_failed',
        'delivery_confirmed','order_cancelled','reservation_cancelled'
    )),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INTEGER,
    reference_type VARCHAR(50) CHECK (reference_type IN ('order', 'reservation', 'payment', 'special_order')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INTEGER,
    reference_type VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'normal',
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
    notify_order_confirmed BOOLEAN DEFAULT true,
    notify_order_ready BOOLEAN DEFAULT true,
    notify_order_delivered BOOLEAN DEFAULT true,
    notify_reservation_confirmed BOOLEAN DEFAULT true,
    notify_reservation_reminder BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ========================================
-- SYSTÈME DE MONÉTISATION
-- ========================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly', 'lifetime')) DEFAULT 'monthly',
    max_menu_items INTEGER,
    max_orders_per_month INTEGER,
    max_reservations_per_month INTEGER,
    max_special_orders_per_month INTEGER,
    max_photos INTEGER DEFAULT 5,
    can_accept_online_orders BOOLEAN DEFAULT true,
    can_accept_reservations BOOLEAN DEFAULT true,
    can_accept_special_orders BOOLEAN DEFAULT true,
    priority_support BOOLEAN DEFAULT false,
    analytics_access BOOLEAN DEFAULT false,
    custom_branding BOOLEAN DEFAULT false,
    api_access BOOLEAN DEFAULT false,
    commission_rate DECIMAL(5,2) DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_subscriptions (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')) DEFAULT 'active',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    next_billing_date TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_payments (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES business_subscriptions(id) ON DELETE CASCADE,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'XOF',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    payment_status VARCHAR(20) CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded')) DEFAULT 'pending',
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    special_order_id INTEGER REFERENCES special_orders(id) ON DELETE CASCADE,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    order_amount DECIMAL(10,2) NOT NULL CHECK (order_amount >= 0),
    commission_rate DECIMAL(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    commission_amount DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
    status VARCHAR(20) CHECK (status IN ('pending', 'collected', 'paid', 'cancelled')) DEFAULT 'pending',
    collected_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (order_id IS NOT NULL AND special_order_id IS NULL) OR
        (order_id IS NULL AND special_order_id IS NOT NULL)
    )
);

-- ========================================
-- PARAMÈTRES DE L'APPLICATION
-- ========================================

CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type VARCHAR(20) CHECK (value_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
    category VARCHAR(50) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- SYSTÈME DE CHAT EN TEMPS RÉEL
-- ========================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    initiated_by VARCHAR(20) CHECK (initiated_by IN ('client', 'guest', 'business')) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('open', 'closed', 'deleted')) DEFAULT 'open',
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NULL,
    sender_type VARCHAR(20) CHECK (sender_type IN ('client', 'business', 'guest')) NOT NULL,
    message TEXT NOT NULL,
    message_type VARCHAR(20) CHECK (message_type IN ('text', 'image', 'file')) DEFAULT 'text',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- SUPPORT TICKETS
-- ========================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open',
    priority VARCHAR(20) CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    is_premium BOOLEAN DEFAULT false,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    response TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- BUSINESS BRANDING
-- ========================================

CREATE TABLE IF NOT EXISTS business_branding (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    primary_color VARCHAR(7) DEFAULT '#0d6efd',
    secondary_color VARCHAR(7) DEFAULT '#6c757d',
    accent_color VARCHAR(7) DEFAULT '#ffc107',
    logo_url TEXT,
    logo_square_url TEXT,
    footer_text TEXT,
    footer_links JSONB DEFAULT '[]'::jsonb,
    custom_domain VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- ✅ TABLE REVIEWS — VERSION FINALE AVEC SUPPORT INVITÉS
-- Différences vs version précédente :
--   • user_id est NULL accepté (invités)
--   • guest_name, guest_phone ajoutés nativement
--   • is_guest colonne calculée automatiquement
--   • Contraintes UNIQUE séparées pour clients et invités
--   • Contrainte d'intégrité auteur obligatoire
-- ========================================

CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- ✅ NULL pour les invités, rempli pour les clients connectés
    user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,

    -- Note et commentaire
    rating  INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,

    -- Réponse du business
    response     TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,

    -- Statut de modération
    status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'approved',

    -- ✅ Champs invité (NULL si client connecté)
    guest_name  VARCHAR(100),
    guest_phone VARCHAR(20),

    -- ✅ Colonne calculée : true si l'auteur est un invité (user_id IS NULL)
    is_guest BOOLEAN GENERATED ALWAYS AS (user_id IS NULL) STORED,

    -- Métadonnées
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- ✅ Contrainte d'intégrité : auteur obligatoirement identifié
    --    Soit par user_id (client connecté), soit par nom+téléphone (invité)
    CONSTRAINT reviews_author_check CHECK (
        (user_id IS NOT NULL)
        OR
        (user_id IS NULL AND guest_name IS NOT NULL AND guest_phone IS NOT NULL)
    )
);

-- ✅ Index UNIQUE partiels (remplace l'ancien UNIQUE(business_id, user_id, order_id))

-- Un seul avis par (business, client connecté) sans commande liée
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_client_no_order
ON reviews(business_id, user_id)
WHERE user_id IS NOT NULL AND order_id IS NULL;

-- Un seul avis par (business, client, commande)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_client_with_order
ON reviews(business_id, user_id, order_id)
WHERE user_id IS NOT NULL AND order_id IS NOT NULL;

-- Un seul avis par (business, téléphone invité)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_guest
ON reviews(business_id, guest_phone)
WHERE user_id IS NULL AND guest_phone IS NOT NULL;

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_reviews_business  ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user       ON reviews(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_guest_phone ON reviews(guest_phone) WHERE guest_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_status     ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating     ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created    ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_is_guest   ON reviews(is_guest);

-- ========================================
-- TESTIMONIALS
-- ========================================

CREATE TABLE IF NOT EXISTS testimonials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL CHECK (LENGTH(comment) >= 50 AND LENGTH(comment) <= 500),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    is_featured BOOLEAN DEFAULT FALSE,
    display_name VARCHAR(255),
    display_photo VARCHAR(500),
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ========================================
-- TRIGGERS
-- ========================================

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menus_updated_at
BEFORE UPDATE ON menus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at
BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_special_orders_updated_at
BEFORE UPDATE ON special_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_notifications_updated_at
BEFORE UPDATE ON client_notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_notification_preferences_updated_at
BEFORE UPDATE ON client_notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_subscriptions_updated_at
BEFORE UPDATE ON business_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_payments_updated_at
BEFORE UPDATE ON subscription_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at
BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON chat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_branding_updated_at
BEFORE UPDATE ON business_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ✅ Trigger pour recalcul automatique des notes moyennes
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_reviews_updated_at();

-- ✅ Trigger pour mettre à jour average_rating et reviews_count dans businesses
CREATE OR REPLACE FUNCTION update_business_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE businesses
    SET
        average_rating = (
            SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0)
            FROM reviews
            WHERE business_id = COALESCE(NEW.business_id, OLD.business_id)
            AND status = 'approved'
        ),
        reviews_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE business_id = COALESCE(NEW.business_id, OLD.business_id)
            AND status = 'approved'
        )
    WHERE id = COALESCE(NEW.business_id, OLD.business_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_business_rating_insert
AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_business_rating();

CREATE TRIGGER trigger_update_business_rating_update
AFTER UPDATE ON reviews FOR EACH ROW
WHEN (OLD.rating IS DISTINCT FROM NEW.rating OR OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_business_rating();

CREATE TRIGGER trigger_update_business_rating_delete
AFTER DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION update_business_rating();

-- Trigger testimonials
CREATE OR REPLACE FUNCTION update_testimonials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER testimonials_updated_at
BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION update_testimonials_updated_at();

-- ========================================
-- INDEX DE PERFORMANCE
-- ========================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active      ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Businesses
CREATE INDEX IF NOT EXISTS idx_businesses_type         ON businesses(type);
CREATE INDEX IF NOT EXISTS idx_businesses_is_active    ON businesses(is_active);
CREATE INDEX IF NOT EXISTS idx_businesses_is_available ON businesses(is_available);
CREATE INDEX IF NOT EXISTS idx_businesses_user_id      ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_rating       ON businesses(average_rating DESC);

-- Menus
CREATE INDEX IF NOT EXISTS idx_menus_business_id ON menus(business_id);
CREATE INDEX IF NOT EXISTS idx_menus_is_active   ON menus(is_active);

-- Menu items
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id      ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_category     ON menu_items(category);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_business_id    ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id      ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_client_phone   ON orders(client_phone);
CREATE INDEX IF NOT EXISTS idx_orders_client_email   ON orders(client_email);

-- Order items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- Special orders
CREATE INDEX IF NOT EXISTS idx_special_orders_business_id  ON special_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_special_orders_client_id    ON special_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_special_orders_event_date   ON special_orders(event_date);
CREATE INDEX IF NOT EXISTS idx_special_orders_status       ON special_orders(status);
CREATE INDEX IF NOT EXISTS idx_special_orders_client_email ON special_orders(client_email);

-- Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_client_id     ON reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date          ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status        ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at    ON reservations(created_at);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id   ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token      ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token      ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id    ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_business_id    ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type           ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read        ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at     ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_business_unread ON notifications(business_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_client_notifications_user_id    ON client_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notifications_is_read    ON client_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_client_notifications_created_at ON client_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_notif_prefs_user_id      ON client_notification_preferences(user_id);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active       ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_billing_period  ON subscription_plans(billing_period);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business_id ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status      ON business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_end_date    ON business_subscriptions(end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_subscriptions_active_unique
    ON business_subscriptions(business_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription_id ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_business_id     ON subscription_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status          ON subscription_payments(payment_status);

-- Commissions
CREATE INDEX IF NOT EXISTS idx_commissions_business_id      ON commissions(business_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id         ON commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_special_order_id ON commissions(special_order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status           ON commissions(status);

-- App settings
CREATE INDEX IF NOT EXISTS idx_app_settings_category  ON app_settings(category);
CREATE INDEX IF NOT EXISTS idx_app_settings_is_public ON app_settings(is_public);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_conversations_business_id  ON chat_conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_client_id    ON chat_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status       ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id   ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender            ON chat_messages(sender_id, sender_type);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read           ON chat_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at        ON chat_messages(created_at ASC);

-- Support
CREATE INDEX IF NOT EXISTS idx_support_tickets_business ON support_tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_premium  ON support_tickets(is_premium) WHERE is_premium = true;
CREATE INDEX IF NOT EXISTS idx_support_tickets_created  ON support_tickets(created_at DESC);

-- Branding
CREATE INDEX IF NOT EXISTS idx_business_branding_business ON business_branding(business_id);

-- Testimonials
CREATE INDEX IF NOT EXISTS idx_testimonials_status   ON testimonials(status);
CREATE INDEX IF NOT EXISTS idx_testimonials_featured ON testimonials(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_testimonials_user     ON testimonials(user_id);

-- ========================================
-- VUE : Businesses avec statut Premium
-- ========================================

CREATE OR REPLACE VIEW businesses_with_premium_status AS
SELECT
    b.*,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM business_subscriptions bs
            JOIN subscription_plans sp ON bs.plan_id = sp.id
            WHERE bs.business_id = b.id AND bs.status = 'active' AND sp.name = 'premium'
        ) THEN true ELSE false
    END AS is_premium,
    sp.display_name AS plan_name,
    sp.name         AS plan_code
FROM businesses b
LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
ORDER BY
    CASE WHEN sp.name = 'premium' THEN 1 WHEN sp.name = 'standard' THEN 2 ELSE 3 END,
    b.average_rating DESC,
    b.created_at DESC;

COMMENT ON VIEW businesses_with_premium_status IS 'Businesses avec statut Premium triés par plan puis par note';

-- ========================================
-- DONNÉES INITIALES
-- ========================================

INSERT INTO subscription_plans (
    name, display_name, description, price, billing_period,
    max_menu_items, max_orders_per_month, max_photos,
    max_reservations_per_month, max_special_orders_per_month,
    can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
    priority_support, analytics_access, custom_branding, commission_rate, sort_order
) VALUES
('free',           'Gratuit',          'Plan de base pour découvrir la plateforme',             0,      'lifetime', 20,   50,   5,  10,   3,  true, true, true, false, true,  false, 10.00, 1),
('standard',       'Standard',         'Pour les établissements en croissance',                 15000,  'monthly',  100,  200,  20, 50,   20, true, true, true, false, true,  false,  5.00, 2),
('standard_yearly','Standard Annuel',  'Standard - Facturation annuelle',                       144000, 'yearly',   100,  200,  20, 50,   20, true, true, true, false, true,  false,  5.00, 3),
('premium',        'Premium',          'Pour les établissements établis - Tout illimité',       35000,  'monthly',  NULL, NULL, 50, NULL, NULL,true, true, true, true,  true,  true,   2.00, 4),
('premium_yearly', 'Premium Annuel',   'Premium - Facturation annuelle',                        336000, 'yearly',   NULL, NULL, 50, NULL, NULL,true, true, true, true,  true,  true,   2.00, 5)
ON CONFLICT (name) DO UPDATE SET
    max_menu_items               = EXCLUDED.max_menu_items,
    max_orders_per_month         = EXCLUDED.max_orders_per_month,
    max_photos                   = EXCLUDED.max_photos,
    max_reservations_per_month   = EXCLUDED.max_reservations_per_month,
    max_special_orders_per_month = EXCLUDED.max_special_orders_per_month,
    can_accept_online_orders     = EXCLUDED.can_accept_online_orders,
    can_accept_reservations      = EXCLUDED.can_accept_reservations,
    can_accept_special_orders    = EXCLUDED.can_accept_special_orders,
    analytics_access             = EXCLUDED.analytics_access,
    commission_rate              = EXCLUDED.commission_rate,
    price                        = EXCLUDED.price,
    description                  = EXCLUDED.description;

INSERT INTO app_settings (key, value, value_type, category, description, is_public) VALUES
('app_name',                'RestoTraiteur',                                                              'string',  'general',       'Nom de l''application',                              true),
('app_tagline',             'Votre plateforme de commande en ligne',                                      'string',  'general',       'Slogan de l''application',                           true),
('maintenance_mode',        'false',                                                                      'boolean', 'general',       'Mode maintenance de l''application',                 false),
('maintenance_message',     'L''application est actuellement en maintenance. Veuillez réessayer.',        'string',  'general',       'Message affiché pendant la maintenance',             true),
('maintenance_end_time',    '',                                                                           'string',  'general',       'Heure de fin prévue de la maintenance',              true),
('allow_new_registrations', 'true',                                                                       'boolean', 'general',       'Autoriser les nouvelles inscriptions',               false),
('default_commission_rate', '5.00',                                                                       'number',  'commissions',   'Taux de commission par défaut (%)',                  false),
('min_commission_amount',   '100',                                                                        'number',  'commissions',   'Montant minimum de commission (XOF)',                false),
('min_order_amount',        '1000',                                                                       'number',  'orders',        'Montant minimum de commande (XOF)',                  true),
('max_order_amount',        '500000',                                                                     'number',  'orders',        'Montant maximum de commande (XOF)',                  true),
('order_cancellation_time', '30',                                                                         'number',  'orders',        'Délai d''annulation de commande (minutes)',          true),
('max_reservation_people',  '20',                                                                         'number',  'reservations',  'Nombre maximum de personnes par réservation',       true),
('reservation_advance_days','30',                                                                         'number',  'reservations',  'Jours à l''avance pour réserver',                   true),
('payment_methods',         '["Mixx By Yas", "flooz"]',                                                   'json',    'payments',      'Méthodes de paiement disponibles',                  true),
('currency',                'XOF',                                                                        'string',  'payments',      'Devise par défaut',                                 true),
('support_email',           'support@restotraiteur.com',                                                  'string',  'contact',       'Email de support',                                  true),
('contact_phone',           '+228 90 00 00 00',                                                           'string',  'contact',       'Téléphone de contact',                              true),
('enable_reviews',          'true',                                                                       'boolean', 'features',      'Activer les avis clients',                          true),
('enable_loyalty_program',  'false',                                                                      'boolean', 'features',      'Activer le programme de fidélité',                  true),
('enable_referral_program', 'false',                                                                      'boolean', 'features',      'Activer le parrainage',                             true),
('max_login_attempts',      '5',                                                                          'number',  'security',      'Nombre max de tentatives de connexion',             false),
('session_timeout',         '7200',                                                                       'number',  'security',      'Durée de session en secondes',                      false),
('enable_email_notifications','true',                                                                     'boolean', 'notifications', 'Activer les notifications par email',               false),
('enable_sms_notifications','false',                                                                      'boolean', 'notifications', 'Activer les notifications par SMS',                 false),
('max_file_size',           '5242880',                                                                    'number',  'uploads',       'Taille maximale des fichiers en octets (5 MB)',      true),
('allowed_file_types',      '["image/jpeg", "image/png", "image/webp", "application/pdf"]',               'json',    'uploads',       'Types de fichiers autorisés',                       true),
('cache_enabled',           'true',                                                                       'boolean', 'performance',   'Activer le cache de l''application',                false),
('cache_duration',          '3600',                                                                       'number',  'performance',   'Durée du cache en secondes',                        false)
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- PRIVILÈGES
-- ========================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO restotraiteur_dbadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO restotraiteur_dbadmin;

-- ========================================
-- COMMENTAIRES
-- ========================================

COMMENT ON TABLE users IS 'Utilisateurs (clients, restaurants, traiteurs, admin)';
COMMENT ON TABLE businesses IS 'Établissements (restaurants et traiteurs)';
COMMENT ON TABLE menus IS 'Menus des établissements';
COMMENT ON TABLE menu_items IS 'Articles/plats dans les menus';
COMMENT ON TABLE orders IS 'Commandes';
COMMENT ON TABLE order_items IS 'Articles dans les commandes';
COMMENT ON TABLE special_orders IS 'Commandes spéciales pour traiteurs';
COMMENT ON TABLE reservations IS 'Réservations pour restaurants';
COMMENT ON TABLE payments IS 'Paiements';
COMMENT ON TABLE notifications IS 'Notifications pour les établissements';
COMMENT ON TABLE client_notifications IS 'Notifications pour les clients';
COMMENT ON TABLE subscription_plans IS 'Plans d''abonnement disponibles';
COMMENT ON TABLE business_subscriptions IS 'Abonnements actifs des établissements';
COMMENT ON TABLE commissions IS 'Commissions sur les commandes';
COMMENT ON TABLE support_tickets IS 'Tickets de support';
COMMENT ON TABLE business_branding IS 'Branding personnalisé (plan Premium)';
COMMENT ON TABLE testimonials IS 'Témoignages clients sur la plateforme';
COMMENT ON TABLE reviews IS 'Avis clients sur les établissements (clients connectés ET invités)';

COMMENT ON COLUMN reviews.user_id     IS 'NULL pour les invités, rempli pour les clients connectés';
COMMENT ON COLUMN reviews.guest_name  IS 'Nom de l''invité (NULL si client connecté)';
COMMENT ON COLUMN reviews.guest_phone IS 'Téléphone de l''invité — anti-doublon (NULL si client connecté)';
COMMENT ON COLUMN reviews.is_guest    IS 'Calculé automatiquement : true si user_id IS NULL';
COMMENT ON COLUMN businesses.average_rating IS 'Note moyenne calculée automatiquement par trigger (0 à 5)';
COMMENT ON COLUMN businesses.reviews_count  IS 'Nombre total d''avis approuvés (mis à jour par trigger)';
COMMENT ON COLUMN subscription_plans.max_reservations_per_month   IS 'NULL = illimité';
COMMENT ON COLUMN subscription_plans.max_special_orders_per_month IS 'NULL = illimité';

-- ========================================
-- FIN DU SCRIPT D'INITIALISATION
-- ========================================

-- ================================================================
-- ÉTAPE 1 : Table de traçabilité des rappels (optionnelle mais recommandée)
-- Évite les doublons si le job tourne plusieurs fois
-- ================================================================

CREATE TABLE IF NOT EXISTS subscription_reminders (
  id              SERIAL PRIMARY KEY,
  subscription_id INTEGER      NOT NULL REFERENCES business_subscriptions(id) ON DELETE CASCADE,
  days_before     INTEGER      NOT NULL,  -- 7, 3, 1 ou 0 (= expiration effective)
  channels        VARCHAR(50),            -- 'email', 'sms', 'email,sms'
  sent_at         TIMESTAMP    DEFAULT NOW(),

  -- Un seul rappel par (subscription, jours, jour calendaire)
  UNIQUE (subscription_id, days_before, (DATE(sent_at)))
);

CREATE INDEX IF NOT EXISTS idx_reminders_subscription ON subscription_reminders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at      ON subscription_reminders(sent_at);


INSERT INTO testimonials (user_id, rating, comment, status, is_featured, display_name) 
VALUES
  (1, 5, 'Service exceptionnel ! J''ai commandé plusieurs fois et à chaque fois la qualité est au rendez-vous. Livraison rapide et plats délicieux.', 'approved', true, 'Marie K.'),
  (2, 5, 'RestoTraiteur a changé ma façon de commander. Interface intuitive, large choix de restaurants, et le support client est très réactif.', 'approved', true, 'Jean-Paul T.'),
  (3, 4, 'Très bonne expérience globale. Les restaurants partenaires sont de qualité et la plateforme est facile à utiliser. Je recommande !', 'approved', false, 'Sylvie D.')
ON CONFLICT (user_id) DO NOTHING;


-- =====================================================
-- MIGRATION : Ajouter 'card' aux méthodes de paiement
-- + Corriger la casse 'Mixx By Yas'
-- =====================================================

-- ── TABLE orders ──────────────────────────────────

-- Supprimer l'ancienne contrainte
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Recréer avec 'card' + casse correcte 'Mixx By Yas'
ALTER TABLE orders
ADD CONSTRAINT orders_payment_method_check
CHECK (payment_method IN ('Mixx By Yas', 'flooz', 'card'));

-- ── TABLE payments ─────────────────────────────────

ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE payments
ADD CONSTRAINT payments_payment_method_check
CHECK (payment_method IN ('Mixx By Yas', 'flooz', 'card'));

-- ── VÉRIFICATION ───────────────────────────────────
SELECT
  conname AS contrainte,
  consrc  AS definition
FROM pg_constraint
WHERE conname IN (
  'orders_payment_method_check',
  'payments_payment_method_check'
);


-- =====================================================
-- MIGRATION OBLIGATOIRE
-- Ajouter 'card' dans toutes les contraintes CHECK
-- + mettre à jour app_settings
-- =====================================================
-- À exécuter dans pgAdmin sur la base restotraiteur
-- =====================================================

-- ── TABLE orders ──────────────────────────────────────────────
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
ADD CONSTRAINT orders_payment_method_check
CHECK (payment_method IN ('Mixx By Yas', 'flooz', 'card'));

-- ── TABLE payments ────────────────────────────────────────────
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE payments
ADD CONSTRAINT payments_payment_method_check
CHECK (payment_method IN ('Mixx By Yas', 'flooz', 'card'));

-- ── app_settings : mettre à jour la liste des méthodes ────────
UPDATE app_settings
SET value = '["Mixx By Yas", "flooz", "card"]'
WHERE key = 'payment_methods';

-- ── VÉRIFICATION ──────────────────────────────────────────────
SELECT
  conname   AS contrainte,
  consrc    AS definition
FROM pg_constraint
WHERE conname IN (
  'orders_payment_method_check',
  'payments_payment_method_check'
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
CHECK (status IN ('pending', 'paid', 'success', 'failed'));

