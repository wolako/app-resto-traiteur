-- ============================================================
-- RestoTraiteur — Script d'initialisation PostgreSQL
-- Version : 2.0 (consolidée)
-- ============================================================
-- Sections :
--   1.  Extensions
--   2.  Fonctions utilitaires
--   3.  Tables principales
--   4.  Tables de commandes
--   5.  Réservations
--   6.  Paiements
--   7.  Auth & sécurité
--   8.  Notifications
--   9.  Monétisation (plans, abonnements, commissions)
--   10. Paramètres application
--   11. Chat temps réel
--   12. Support tickets
--   13. Branding
--   14. Avis (reviews)
--   15. Témoignages
--   16. Analytics
--   17. Contact
--   18. Index de performance
--   19. Vues
--   20. Triggers
--   21. Fonctions métier
--   22. Données initiales
--   23. Privilèges & commentaires
-- ============================================================

SET CLIENT_ENCODING TO 'UTF8';

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. FONCTIONS UTILITAIRES
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. TABLES PRINCIPALES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255) UNIQUE NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    role                VARCHAR(20)  NOT NULL CHECK (role IN ('client','restaurant','traiteur','superadmin')),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    phone               VARCHAR(20),
    is_active           BOOLEAN DEFAULT true,
    email_verified      BOOLEAN DEFAULT false,
    email_verified_at   TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS businesses (
    id                                       SERIAL PRIMARY KEY,
    user_id                                  INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name                                     VARCHAR(255) NOT NULL,
    type                                     VARCHAR(20)  NOT NULL CHECK (type IN ('restaurant','traiteur')),
    description                              TEXT,
    address                                  TEXT,
    phone                                    VARCHAR(20),
    opening_hour                             TIME,
    closing_hour                             TIME,
    availability_start                       TIME,
    availability_end                         TIME,
    is_available                             BOOLEAN DEFAULT false,
    is_active                                BOOLEAN DEFAULT true,
    average_rating                           DECIMAL(2,1) DEFAULT 0,
    reviews_count                            INTEGER DEFAULT 0,
    cinetpay_merchant_id                     VARCHAR(100),
    requires_reservation_deposit             BOOLEAN DEFAULT false,
    default_deposit_amount                   DECIMAL(10,2),
    default_special_order_deposit_percentage INTEGER DEFAULT 30,
    -- Profil public
    slug                                     VARCHAR(255) UNIQUE,
    tagline                                  VARCHAR(255),
    cover_image_url                          TEXT,
    created_at                               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at                               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_hours_check CHECK (
        (type = 'restaurant' AND opening_hour IS NOT NULL AND closing_hour IS NOT NULL) OR
        (type = 'traiteur'   AND availability_start IS NOT NULL AND availability_end IS NOT NULL) OR
        (opening_hour IS NULL AND closing_hour IS NULL AND availability_start IS NULL AND availability_end IS NULL)
    )
);

-- Générer slugs pour les établissements existants
UPDATE businesses
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRANSLATE(name,
        'àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞ',
        'aaaaaaaceeeeiiiidnoooooouuuuytya aaaaaaaceeeeiiiidnoooooouuuuytp'
      ), '[^a-z0-9\s-]', '', 'g'), '\s+', '-', 'g'
  )
) || '-' || id
WHERE slug IS NULL;

CREATE TABLE IF NOT EXISTS menus (
    id          SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
    id           SERIAL PRIMARY KEY,
    menu_id      INTEGER REFERENCES menus(id) ON DELETE CASCADE,
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    price        DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    category     VARCHAR(100),
    is_available BOOLEAN DEFAULT true,
    image_url    TEXT,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. TABLES DE COMMANDES
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id                    SERIAL PRIMARY KEY,
    business_id           INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name           VARCHAR(255)  NOT NULL,
    client_phone          VARCHAR(20)   NOT NULL,
    client_email          VARCHAR(255),
    subtotal_amount       DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    delivery_fee          DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    payment_fee           DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (payment_fee >= 0),
    total_amount          DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status                VARCHAR(20)   DEFAULT 'pending'
                              CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
    payment_type          VARCHAR(20)   DEFAULT 'online' CHECK (payment_type IN ('online','cod')),
    payment_status        VARCHAR(20)   DEFAULT 'pending'
                              CHECK (payment_status IN ('pending','paid','failed','cod_pending','cod_received')),
    payment_method        VARCHAR(20)   CHECK (payment_method IN ('Mixx By Yas','flooz','card','cash')),
    cod_amount            DECIMAL(10,2),
    cod_received_at       TIMESTAMP WITH TIME ZONE,
    cod_confirmed_by      INTEGER REFERENCES users(id),
    delivery_address      TEXT,
    delivery_distance     DECIMAL(5,2),
    delivery_confirmed    BOOLEAN DEFAULT false,
    delivery_confirmed_at TIMESTAMP WITH TIME ZONE,
    notes                 TEXT,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER REFERENCES orders(id)     ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity     INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price   DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    subtotal     DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS special_orders (
    id                       SERIAL PRIMARY KEY,
    business_id              INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name              VARCHAR(255) NOT NULL,
    client_email             VARCHAR(255) NOT NULL,
    client_phone             VARCHAR(20)  NOT NULL,
    event_type               VARCHAR(50)  NOT NULL,
    event_date               DATE         NOT NULL,
    event_time               TIME         NOT NULL,
    number_of_guests         INTEGER      NOT NULL,
    delivery_address         TEXT         NOT NULL,
    city                     VARCHAR(100) NOT NULL,
    menu_preferences         TEXT         NOT NULL,
    dietary_restrictions     TEXT,
    special_requests         TEXT,
    estimated_budget         DECIMAL(10,2),
    status                   VARCHAR(20)  DEFAULT 'pending',
    quoted_amount            DECIMAL(10,2),
    deposit_percentage       INTEGER      DEFAULT 30,
    deposit_amount           DECIMAL(10,2),
    deposit_status           VARCHAR(50)  DEFAULT 'none',
    deposit_payment_method   VARCHAR(50),
    deposit_payment_fee      DECIMAL(10,2) DEFAULT 0.00,
    deposit_payment_id       VARCHAR(255),
    deposit_paid_at          TIMESTAMP WITH TIME ZONE,
    deposit_cod_confirmed_by INTEGER REFERENCES users(id),
    deposit_cod_confirmed_at TIMESTAMP WITH TIME ZONE,
    transport_fee            DECIMAL(10,2) DEFAULT 0.00,
    final_amount             DECIMAL(10,2),
    quote_notes              TEXT,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. RÉSERVATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
    id                       SERIAL PRIMARY KEY,
    restaurant_id            INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    client_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name              VARCHAR(255) NOT NULL,
    client_phone             VARCHAR(20)  NOT NULL,
    client_email             VARCHAR(255),
    reservation_date         DATE         NOT NULL,
    time_slot                TIME         NOT NULL,
    number_of_people         INTEGER      NOT NULL CHECK (number_of_people > 0 AND number_of_people <= 20),
    status                   VARCHAR(20)  DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
    special_requests         TEXT,
    deposit_required         BOOLEAN      DEFAULT false,
    deposit_amount           DECIMAL(10,2),
    deposit_status           VARCHAR(50)  DEFAULT 'none',
    deposit_payment_method   VARCHAR(50),
    deposit_payment_fee      DECIMAL(10,2) DEFAULT 0.00,
    deposit_payment_id       VARCHAR(255),
    deposit_paid_at          TIMESTAMP WITH TIME ZONE,
    deposit_cod_confirmed_by INTEGER REFERENCES users(id),
    deposit_cod_confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_reservation UNIQUE (restaurant_id, reservation_date, time_slot)
);

-- ============================================================
-- 6. PAIEMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS business_payment_accounts (
    id                           SERIAL PRIMARY KEY,
    business_id                  INTEGER NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    -- CinetPay
    cinetpay_site_id             VARCHAR(100),
    cinetpay_api_key             VARCHAR(255),
    cinetpay_sub_merchant_id     VARCHAR(100),
    -- Méthode de reversement
    preferred_payout_method      VARCHAR(20) CHECK (preferred_payout_method IN ('mixx','flooz','bank')),
    mixx_number                  VARCHAR(20),
    flooz_number                 VARCHAR(20),
    -- Banque
    bank_name                    VARCHAR(100),
    bank_account_number          VARCHAR(50),
    bank_account_holder          VARCHAR(150),
    bank_iban                    VARCHAR(50),
    -- Informations légales
    legal_name                   VARCHAR(150),
    business_registration_number VARCHAR(50),
    business_type                VARCHAR(20) DEFAULT 'individual' CHECK (business_type IN ('individual','company')),
    -- Statut vérification
    status                       VARCHAR(30) NOT NULL DEFAULT 'not_configured'
                                     CHECK (status IN ('not_configured','pending_verification','verified','rejected','suspended')),
    rejection_reason             TEXT,
    verified_at                  TIMESTAMP WITH TIME ZONE,
    verified_by                  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    admin_notes                  TEXT,
    created_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id               SERIAL PRIMARY KEY,
    order_id         INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    payment_id       VARCHAR(255) UNIQUE NOT NULL,
    amount           DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency         VARCHAR(3)    DEFAULT 'XOF',
    payment_method   VARCHAR(20)   NOT NULL CHECK (payment_method IN ('Mixx By Yas','flooz','card')),
    status           VARCHAR(20)   DEFAULT 'pending' CHECK (status IN ('pending','paid','success','failed')),
    transaction_id   VARCHAR(255),
    gateway_response JSONB,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. AUTH & SÉCURITÉ
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used       BOOLEAN DEFAULT false,
    used_at    TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    verified    BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id             SERIAL PRIMARY KEY,
    business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    type           VARCHAR(50) NOT NULL CHECK (type IN (
                       'new_order','new_reservation','payment_success','payment_failed',
                       'delivery_confirmed','order_cancelled','reservation_cancelled'
                   )),
    title          VARCHAR(255) NOT NULL,
    message        TEXT         NOT NULL,
    reference_id   INTEGER,
    reference_type VARCHAR(50)  CHECK (reference_type IN ('order','reservation','payment','special_order')),
    priority       VARCHAR(20)  DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    metadata       JSONB        DEFAULT '{}',
    is_read        BOOLEAN      DEFAULT false,
    read_at        TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_notifications (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type           VARCHAR(50)  NOT NULL,
    title          VARCHAR(255) NOT NULL,
    message        TEXT         NOT NULL,
    reference_id   INTEGER,
    reference_type VARCHAR(50),
    priority       VARCHAR(20)  DEFAULT 'normal',
    metadata       JSONB        DEFAULT '{}',
    is_read        BOOLEAN      DEFAULT false,
    read_at        TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_notification_preferences (
    id                           SERIAL PRIMARY KEY,
    user_id                      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_notifications          BOOLEAN DEFAULT true,
    sms_notifications            BOOLEAN DEFAULT true,
    push_notifications           BOOLEAN DEFAULT true,
    notify_order_confirmed       BOOLEAN DEFAULT true,
    notify_order_ready           BOOLEAN DEFAULT true,
    notify_order_delivered       BOOLEAN DEFAULT true,
    notify_reservation_confirmed BOOLEAN DEFAULT true,
    notify_reservation_reminder  BOOLEAN DEFAULT true,
    created_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================================
-- 9. MONÉTISATION
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id                           SERIAL PRIMARY KEY,
    name                         VARCHAR(50)   NOT NULL UNIQUE,
    display_name                 VARCHAR(100)  NOT NULL,
    description                  TEXT,
    price                        DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    billing_period               VARCHAR(20)   DEFAULT 'monthly'
                                     CHECK (billing_period IN ('monthly','yearly','lifetime')),
    max_menu_items               INTEGER,
    max_orders_per_month         INTEGER,
    max_reservations_per_month   INTEGER,
    max_special_orders_per_month INTEGER,
    max_photos                   INTEGER DEFAULT 5,
    can_accept_online_orders     BOOLEAN DEFAULT true,
    can_accept_reservations      BOOLEAN DEFAULT true,
    can_accept_special_orders    BOOLEAN DEFAULT true,
    priority_support             BOOLEAN DEFAULT false,
    analytics_access             BOOLEAN DEFAULT false,
    custom_branding              BOOLEAN DEFAULT false,
    api_access                   BOOLEAN DEFAULT false,
    commission_rate              DECIMAL(5,2) DEFAULT 0
                                     CHECK (commission_rate >= 0 AND commission_rate <= 100),
    is_active                    BOOLEAN DEFAULT true,
    sort_order                   INTEGER DEFAULT 0,
    created_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_subscriptions (
    id                SERIAL PRIMARY KEY,
    business_id       INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id           INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status            VARCHAR(20) DEFAULT 'active'
                          CHECK (status IN ('active','cancelled','expired','suspended')),
    start_date        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date          TIMESTAMP WITH TIME ZONE,
    next_billing_date TIMESTAMP WITH TIME ZONE,
    auto_renew        BOOLEAN DEFAULT true,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_payments (
    id                   SERIAL PRIMARY KEY,
    subscription_id      INTEGER NOT NULL REFERENCES business_subscriptions(id) ON DELETE CASCADE,
    business_id          INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id              INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    amount               DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency             VARCHAR(3)    DEFAULT 'XOF',
    payment_method       VARCHAR(50),
    transaction_id       VARCHAR(255),
    payment_status       VARCHAR(20)   DEFAULT 'pending'
                             CHECK (payment_status IN ('pending','success','failed','refunded')),
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end   TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata             JSONB DEFAULT '{}',
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ✅ Contrainte UNIQUE sans expression de fonction (compatible PostgreSQL stable)
CREATE TABLE IF NOT EXISTS subscription_reminders (
    id              SERIAL PRIMARY KEY,
    subscription_id INTEGER   NOT NULL REFERENCES business_subscriptions(id) ON DELETE CASCADE,
    days_before     INTEGER   NOT NULL,
    channels        VARCHAR(50),
    sent_at         TIMESTAMP DEFAULT NOW()
    -- Anti-doublon géré applicativement (reminderAlreadySent)
    -- pas de UNIQUE(subscription_id, days_before, DATE(sent_at)) — expression non supportée dans UNIQUE
);

CREATE TABLE IF NOT EXISTS commissions (
    id                      SERIAL PRIMARY KEY,
    order_id                INTEGER REFERENCES orders(id)         ON DELETE CASCADE,
    special_order_id        INTEGER REFERENCES special_orders(id)  ON DELETE CASCADE,
    business_id             INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    order_amount            DECIMAL(10,2) NOT NULL CHECK (order_amount >= 0),
    commission_rate         DECIMAL(5,2)  NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    commission_amount       DECIMAL(10,2) NOT NULL CHECK (commission_amount >= 0),
    restaurant_amount       DECIMAL(10,2) DEFAULT 0 CHECK (restaurant_amount >= 0),
    platform_amount         DECIMAL(10,2) DEFAULT 0 CHECK (platform_amount >= 0),
    payment_split_completed BOOLEAN DEFAULT false,
    status                  VARCHAR(20)   DEFAULT 'pending'
                                CHECK (status IN ('pending','collected','paid','cancelled')),
    collected_at            TIMESTAMP WITH TIME ZONE,
    paid_at                 TIMESTAMP WITH TIME ZONE,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (order_id IS NOT NULL AND special_order_id IS NULL) OR
        (order_id IS NULL     AND special_order_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS commission_invoices (
    id               SERIAL PRIMARY KEY,
    business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_start     DATE    NOT NULL,
    period_end       DATE    NOT NULL,
    total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
    commission_count INTEGER       NOT NULL DEFAULT 0,
    status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','overdue','cancelled')),
    payment_url      TEXT,
    payment_id       VARCHAR(255),
    paid_at          TIMESTAMP WITH TIME ZONE,
    due_date         DATE NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS commission_invoice_items (
    id            SERIAL PRIMARY KEY,
    invoice_id    INTEGER NOT NULL REFERENCES commission_invoices(id) ON DELETE CASCADE,
    commission_id INTEGER NOT NULL REFERENCES commissions(id),
    order_id      INTEGER NOT NULL REFERENCES orders(id),
    amount        DECIMAL(10,2) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. PARAMÈTRES APPLICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT         NOT NULL,
    value_type  VARCHAR(20)  DEFAULT 'string'
                    CHECK (value_type IN ('string','number','boolean','json')),
    category    VARCHAR(50)  NOT NULL,
    description TEXT,
    is_public   BOOLEAN DEFAULT false,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. CHAT TEMPS RÉEL
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id              SERIAL PRIMARY KEY,
    business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_name     VARCHAR(255) NOT NULL,
    client_phone    VARCHAR(20)  NOT NULL,
    initiated_by    VARCHAR(20)  NOT NULL CHECK (initiated_by IN ('client','guest','business')),
    status          VARCHAR(20)  DEFAULT 'open' CHECK (status IN ('open','closed','deleted')),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER,
    sender_type     VARCHAR(20) NOT NULL CHECK (sender_type IN ('client','business','guest')),
    message         TEXT        NOT NULL,
    message_type    VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text','image','file')),
    is_read         BOOLEAN DEFAULT false,
    read_at         TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. SUPPORT TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id           SERIAL PRIMARY KEY,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    subject      VARCHAR(255) NOT NULL,
    message      TEXT         NOT NULL,
    status       VARCHAR(20)  DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','resolved','closed')),
    priority     VARCHAR(20)  DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    is_premium   BOOLEAN DEFAULT false,
    assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    response     TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 13. BRANDING
-- ============================================================

CREATE TABLE IF NOT EXISTS business_branding (
    id                  SERIAL PRIMARY KEY,
    business_id         INTEGER NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    -- Couleurs
    primary_color       VARCHAR(7)  DEFAULT '#0d6efd',
    secondary_color     VARCHAR(7)  DEFAULT '#6c757d',
    accent_color        VARCHAR(7)  DEFAULT '#ffc107',
    -- Logos & images
    logo_url            TEXT,
    logo_square_url     TEXT,
    banner_url          TEXT,
    banner_mobile_url   TEXT,
    gallery_urls        JSONB DEFAULT '[]'::jsonb,
    -- Textes
    tagline             VARCHAR(255),
    footer_text         TEXT,
    footer_links        JSONB DEFAULT '[]'::jsonb,
    custom_domain       VARCHAR(255),
    -- Réseaux sociaux
    facebook_url        VARCHAR(500),
    instagram_url       VARCHAR(500),
    whatsapp_number     VARCHAR(20),
    tiktok_url          VARCHAR(500),
    -- Infos pratiques
    opening_hours_text  VARCHAR(255),
    -- Highlights (3 arguments clés)
    highlight_1_icon    VARCHAR(50)  DEFAULT 'bi-award',
    highlight_1_text    VARCHAR(100),
    highlight_2_icon    VARCHAR(50)  DEFAULT 'bi-clock',
    highlight_2_text    VARCHAR(100),
    highlight_3_icon    VARCHAR(50)  DEFAULT 'bi-geo-alt',
    highlight_3_text    VARCHAR(100),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 14. AVIS CLIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
    id           SERIAL PRIMARY KEY,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating       INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment      TEXT,
    response     TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    status       VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
    guest_name   VARCHAR(100),
    guest_phone  VARCHAR(20),
    is_guest     BOOLEAN GENERATED ALWAYS AS (user_id IS NULL) STORED,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reviews_author_check CHECK (
        (user_id IS NOT NULL) OR
        (user_id IS NULL AND guest_name IS NOT NULL AND guest_phone IS NOT NULL)
    )
);

-- ============================================================
-- 15. TÉMOIGNAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS testimonials (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating           INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment          TEXT    NOT NULL CHECK (LENGTH(comment) >= 50 AND LENGTH(comment) <= 500),
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected')),
    is_featured      BOOLEAN DEFAULT false,
    display_name     VARCHAR(255),
    display_photo    VARCHAR(500),
    rejection_reason TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================================
-- 16. ANALYTICS
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    id               BIGSERIAL PRIMARY KEY,
    business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    event_type       VARCHAR(50) NOT NULL CHECK (event_type IN (
                         'page_view','menu_click','item_click',
                         'order_started','order_completed',
                         'reservation_started','reservation_completed',
                         'search','contact_click'
                     )),
    menu_id          INTEGER REFERENCES menus(id)        ON DELETE SET NULL,
    menu_item_id     INTEGER REFERENCES menu_items(id)   ON DELETE SET NULL,
    order_id         INTEGER REFERENCES orders(id)       ON DELETE SET NULL,
    reservation_id   INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
    session_id       VARCHAR(100),
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_authenticated BOOLEAN DEFAULT false,
    metadata         JSONB DEFAULT '{}',
    ip_hash          VARCHAR(64),
    user_agent       TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 17. CONTACT
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_messages (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    phone      VARCHAR(20)  NOT NULL,
    subject    VARCHAR(50)  NOT NULL
                   CHECK (subject IN ('question','support','business','complaint','other')),
    message    TEXT         NOT NULL CHECK (LENGTH(message) >= 10),
    status     VARCHAR(20)  NOT NULL DEFAULT 'unread'
                   CHECK (status IN ('unread','read','replied','archived')),
    reply      TEXT,
    replied_at TIMESTAMP WITH TIME ZONE,
    replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 18. INDEX DE PERFORMANCE
-- ============================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active      ON users(is_active);

-- Businesses
CREATE INDEX IF NOT EXISTS idx_businesses_user_id      ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_type         ON businesses(type);
CREATE INDEX IF NOT EXISTS idx_businesses_is_active    ON businesses(is_active);
CREATE INDEX IF NOT EXISTS idx_businesses_is_available ON businesses(is_available);
CREATE INDEX IF NOT EXISTS idx_businesses_rating       ON businesses(average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_slug         ON businesses(slug);

-- Menus & items
CREATE INDEX IF NOT EXISTS idx_menus_business_id       ON menus(business_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id      ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(is_available);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_business_id    ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id      ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_cod_pending    ON orders(payment_type, payment_status)
    WHERE payment_type = 'cod' AND payment_status = 'cod_pending';

-- Order items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- Special orders
CREATE INDEX IF NOT EXISTS idx_special_orders_business_id ON special_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_special_orders_event_date  ON special_orders(event_date);
CREATE INDEX IF NOT EXISTS idx_special_orders_status      ON special_orders(status);

-- Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_client_id     ON reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date          ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status        ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at    ON reservations(created_at);

-- Payment accounts
CREATE INDEX IF NOT EXISTS idx_payment_accounts_business_id ON business_payment_accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_status      ON business_payment_accounts(status);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_cinetpay    ON business_payment_accounts(cinetpay_sub_merchant_id)
    WHERE cinetpay_sub_merchant_id IS NOT NULL;

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id   ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);

-- Auth tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token      ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token  ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_business_id     ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read         ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at      ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_business_unread ON notifications(business_id, is_read)
    WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_client_notifications_user_id    ON client_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notifications_is_read    ON client_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_client_notifications_created_at ON client_notifications(created_at DESC);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status   ON business_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_business_subscriptions_end_date ON business_subscriptions(end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_subscriptions_active_unique
    ON business_subscriptions(business_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_reminders_subscription ON subscription_reminders(subscription_id);
CREATE INDEX IF NOT EXISTS idx_reminders_sent_at      ON subscription_reminders(sent_at);

-- Commissions
CREATE INDEX IF NOT EXISTS idx_commissions_business_id     ON commissions(business_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id        ON commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status          ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_split_completed ON commissions(payment_split_completed)
    WHERE payment_split_completed = true;
CREATE INDEX IF NOT EXISTS idx_invoices_business ON commission_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON commission_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON commission_invoices(due_date);

-- App settings
CREATE INDEX IF NOT EXISTS idx_app_settings_category  ON app_settings(category);
CREATE INDEX IF NOT EXISTS idx_app_settings_is_public ON app_settings(is_public);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_conversations_business_id  ON chat_conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status       ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id   ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read           ON chat_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at        ON chat_messages(created_at ASC);

-- Support
CREATE INDEX IF NOT EXISTS idx_support_tickets_business ON support_tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created  ON support_tickets(created_at DESC);

-- Branding
CREATE INDEX IF NOT EXISTS idx_business_branding_business ON business_branding(business_id);

-- Reviews
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_client_no_order
    ON reviews(business_id, user_id) WHERE user_id IS NOT NULL AND order_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_client_with_order
    ON reviews(business_id, user_id, order_id) WHERE user_id IS NOT NULL AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_guest
    ON reviews(business_id, guest_phone) WHERE user_id IS NULL AND guest_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status   ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating   ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created  ON reviews(created_at DESC);

-- Testimonials
CREATE INDEX IF NOT EXISTS idx_testimonials_status   ON testimonials(status);
CREATE INDEX IF NOT EXISTS idx_testimonials_featured ON testimonials(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_testimonials_user     ON testimonials(user_id);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_business_date ON analytics_events(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type    ON analytics_events(business_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session       ON analytics_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_menu_item     ON analytics_events(menu_item_id) WHERE menu_item_id IS NOT NULL;
-- ✅ CAST au lieu de DATE() pour compatibilité index PostgreSQL
CREATE INDEX IF NOT EXISTS idx_analytics_date_only     ON analytics_events(business_id, CAST(created_at AS DATE));

-- Contact
CREATE INDEX IF NOT EXISTS idx_contact_messages_status     ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_email      ON contact_messages(email);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at DESC);

-- ============================================================
-- 19. VUES
-- ============================================================

CREATE OR REPLACE VIEW businesses_with_premium_status AS
SELECT
    b.*,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM business_subscriptions bs
            JOIN subscription_plans sp ON bs.plan_id = sp.id
            WHERE bs.business_id = b.id AND bs.status = 'active' AND sp.name LIKE 'premium%'
        ) THEN true ELSE false
    END AS is_premium,
    sp.display_name AS plan_name,
    sp.name         AS plan_code
FROM businesses b
LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
ORDER BY
    CASE WHEN sp.name LIKE 'premium%' THEN 1 WHEN sp.name LIKE 'standard%' THEN 2 ELSE 3 END,
    b.average_rating DESC, b.created_at DESC;

-- ✅ Colonne 'date' (pas 'day') pour compatibilité controllers
CREATE OR REPLACE VIEW analytics_daily_summary AS
SELECT
    business_id,
    DATE(created_at)                                                              AS date,
    COUNT(*) FILTER (WHERE event_type = 'page_view')                             AS page_views,
    COUNT(*) FILTER (WHERE event_type = 'menu_click')                            AS menu_clicks,
    COUNT(*) FILTER (WHERE event_type = 'item_click')                            AS item_clicks,
    COUNT(*) FILTER (WHERE event_type = 'order_started')                         AS orders_started,
    COUNT(*) FILTER (WHERE event_type = 'order_completed')                       AS orders_completed,
    COUNT(*) FILTER (WHERE event_type = 'reservation_started')                   AS reservations_started,
    COUNT(*) FILTER (WHERE event_type = 'reservation_completed')                 AS reservations_completed,
    COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)             AS unique_sessions
FROM analytics_events
GROUP BY business_id, DATE(created_at);

CREATE OR REPLACE VIEW analytics_popular_items AS
SELECT
    ae.business_id,
    ae.menu_item_id,
    mi.name     AS item_name,
    mi.price    AS item_price,
    mi.category AS item_category,
    COUNT(*) FILTER (WHERE ae.event_type = 'item_click')    AS click_count,
    COUNT(*) FILTER (WHERE ae.event_type = 'order_completed') AS order_count,
    COUNT(*)                                                 AS total_interactions,
    MAX(ae.created_at)                                       AS last_interaction_at
FROM analytics_events ae
JOIN menu_items mi ON ae.menu_item_id = mi.id
WHERE ae.menu_item_id IS NOT NULL
GROUP BY ae.business_id, ae.menu_item_id, mi.name, mi.price, mi.category;

CREATE OR REPLACE VIEW restaurant_revenue_stats AS
SELECT
    b.id   AS business_id,
    b.name AS business_name,
    b.type AS business_type,
    COALESCE(SUM(c.restaurant_amount) FILTER (WHERE c.payment_split_completed), 0) AS total_received,
    COALESCE(SUM(c.platform_amount)   FILTER (WHERE c.payment_split_completed), 0) AS total_commissions,
    COALESCE(SUM(c.order_amount)      FILTER (WHERE c.payment_split_completed), 0) AS total_orders_amount,
    COUNT(*)                          FILTER (WHERE c.payment_split_completed)     AS transaction_count,
    COALESCE(SUM(c.restaurant_amount) FILTER (WHERE c.payment_split_completed AND DATE_TRUNC('month',c.created_at) = DATE_TRUNC('month',CURRENT_DATE)), 0) AS this_month_received,
    COALESCE(SUM(c.platform_amount)   FILTER (WHERE c.payment_split_completed AND DATE_TRUNC('month',c.created_at) = DATE_TRUNC('month',CURRENT_DATE)), 0) AS this_month_commissions
FROM businesses b
LEFT JOIN commissions c ON b.id = c.business_id
GROUP BY b.id, b.name, b.type;

CREATE OR REPLACE VIEW cod_stats AS
SELECT
    b.id   AS business_id,
    b.name AS business_name,
    COUNT(o.id)                                                                    AS total_cod_orders,
    COUNT(o.id) FILTER (WHERE o.payment_status = 'cod_pending')                   AS pending_count,
    COUNT(o.id) FILTER (WHERE o.payment_status = 'cod_received')                  AS received_count,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'cod_pending'),  0) AS pending_amount,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'cod_received'), 0) AS received_amount
FROM businesses b
LEFT JOIN orders o ON b.id = o.business_id AND o.payment_type = 'cod'
GROUP BY b.id, b.name;

-- ============================================================
-- 20. TRIGGERS
-- ============================================================

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
CREATE TRIGGER update_business_payment_accounts_updated_at
    BEFORE UPDATE ON business_payment_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_messages_updated_at
    BEFORE UPDATE ON contact_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger reviews : updated_at
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_update_reviews_updated_at
    BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_reviews_updated_at();

-- Trigger reviews : recalcul note moyenne
CREATE OR REPLACE FUNCTION update_business_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE businesses SET
        average_rating = (SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0) FROM reviews WHERE business_id = COALESCE(NEW.business_id,OLD.business_id) AND status = 'approved'),
        reviews_count  = (SELECT COUNT(*) FROM reviews WHERE business_id = COALESCE(NEW.business_id,OLD.business_id) AND status = 'approved')
    WHERE id = COALESCE(NEW.business_id, OLD.business_id);
    RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_update_business_rating_insert
    AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_business_rating();
CREATE TRIGGER trigger_update_business_rating_update
    AFTER UPDATE ON reviews FOR EACH ROW
    WHEN (OLD.rating IS DISTINCT FROM NEW.rating OR OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_business_rating();
CREATE TRIGGER trigger_update_business_rating_delete
    AFTER DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION update_business_rating();

-- Trigger testimonials : updated_at
CREATE OR REPLACE FUNCTION update_testimonials_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER testimonials_updated_at
    BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION update_testimonials_updated_at();

-- Trigger commission_invoices : updated_at
CREATE OR REPLACE FUNCTION update_invoice_timestamp()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_invoice_updated_at
    BEFORE UPDATE ON commission_invoices FOR EACH ROW EXECUTE FUNCTION update_invoice_timestamp();

-- ============================================================
-- 21. FONCTIONS MÉTIER
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_analytics()
RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '12 months';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Analytics cleanup: % événements supprimés', deleted_count;
    RETURN deleted_count;
END; $$ LANGUAGE plpgsql;

-- ============================================================
-- 22. DONNÉES INITIALES
-- ============================================================

INSERT INTO subscription_plans (
    name, display_name, description, price, billing_period,
    max_menu_items, max_orders_per_month, max_photos,
    max_reservations_per_month, max_special_orders_per_month,
    can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
    priority_support, analytics_access, custom_branding, commission_rate, sort_order
) VALUES
('free',            'Gratuit',         'Plan de base pour découvrir la plateforme',            0, 'lifetime', 20,   50,   5,  10,   3,  true, true, true, false, false, false, 10.00, 1),
('standard',        'Standard',        'Pour les établissements en croissance',            15000, 'monthly',  100, 200,  20,  50,  20,  true, true, true, false, false, false,  5.00, 2),
('standard_yearly', 'Standard Annuel', 'Standard — Facturation annuelle',                144000, 'yearly',   100, 200,  20,  50,  20,  true, true, true, false, false, false,  5.00, 3),
('premium',         'Premium',         'Pour les établissements établis — Tout illimité',  35000, 'monthly',  NULL,NULL, 50, NULL,NULL, true, true, true, true,  true,  true,   2.00, 4),
('premium_yearly',  'Premium Annuel',  'Premium — Facturation annuelle',                 336000, 'yearly',   NULL,NULL, 50, NULL,NULL, true, true, true, true,  true,  true,   2.00, 5)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name, description = EXCLUDED.description,
    price = EXCLUDED.price, max_menu_items = EXCLUDED.max_menu_items,
    max_orders_per_month = EXCLUDED.max_orders_per_month, max_photos = EXCLUDED.max_photos,
    max_reservations_per_month = EXCLUDED.max_reservations_per_month,
    max_special_orders_per_month = EXCLUDED.max_special_orders_per_month,
    priority_support = EXCLUDED.priority_support, analytics_access = EXCLUDED.analytics_access,
    custom_branding = EXCLUDED.custom_branding, commission_rate = EXCLUDED.commission_rate,
    sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_settings (key, value, value_type, category, description, is_public) VALUES
('app_name',                  'RestoTraiteur',                                                'string',  'general',       'Nom de l''application',                          true),
('app_tagline',               'Votre plateforme de commande en ligne',                        'string',  'general',       'Slogan de l''application',                       true),
('maintenance_mode',          'false',                                                        'boolean', 'general',       'Mode maintenance',                               false),
('maintenance_message',       'L''application est actuellement en maintenance.',              'string',  'general',       'Message maintenance',                            true),
('maintenance_end_time',      '',                                                             'string',  'general',       'Fin de maintenance prévue',                      true),
('allow_new_registrations',   'true',                                                         'boolean', 'general',       'Autoriser nouvelles inscriptions',               false),
('default_commission_rate',   '5.00',                                                         'number',  'commissions',   'Taux commission par défaut (%)',                  false),
('min_order_amount',          '1000',                                                         'number',  'orders',        'Montant minimum commande (XOF)',                  true),
('max_order_amount',          '500000',                                                       'number',  'orders',        'Montant maximum commande (XOF)',                  true),
('max_reservation_people',    '20',                                                           'number',  'reservations',  'Nombre maximum de personnes',                    true),
('payment_methods',           '["Mixx By Yas", "flooz", "card"]',                             'json',    'payments',      'Méthodes de paiement',                           true),
('currency',                  'XOF',                                                          'string',  'payments',      'Devise par défaut',                              true),
('support_email',             'support@restotraiteur.com',                                    'string',  'contact',       'Email de support',                               true),
('contact_phone',             '+228 90 00 00 00',                                             'string',  'contact',       'Téléphone de contact',                           true),
('enable_reviews',            'true',                                                         'boolean', 'features',      'Activer les avis clients',                       true),
('enable_email_notifications','true',                                                         'boolean', 'notifications', 'Notifications email',                            false),
('enable_sms_notifications',  'false',                                                        'boolean', 'notifications', 'Notifications SMS',                              false),
('max_file_size',             '5242880',                                                      'number',  'uploads',       'Taille max fichiers (5 MB)',                      true),
('allowed_file_types',        '["image/jpeg","image/png","image/webp","application/pdf"]',    'json',    'uploads',       'Types de fichiers autorisés',                    true),
('max_login_attempts',        '5',                                                            'number',  'security',      'Tentatives de connexion max',                    false),
('session_timeout',           '7200',                                                         'number',  'security',      'Durée session (secondes)',                        false)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 23. PRIVILÈGES & COMMENTAIRES
-- ============================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO restotraiteur_dbadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO restotraiteur_dbadmin;

COMMENT ON TABLE users                    IS 'Utilisateurs (clients, restaurants, traiteurs, admin)';
COMMENT ON TABLE businesses               IS 'Établissements (restaurants et traiteurs)';
COMMENT ON TABLE orders                   IS 'Commandes (online et COD)';
COMMENT ON TABLE reservations             IS 'Réservations pour restaurants';
COMMENT ON TABLE business_payment_accounts IS 'Comptes de reversement CinetPay — split payment';
COMMENT ON TABLE analytics_events         IS 'Événements analytics (conservation 12 mois)';
COMMENT ON TABLE contact_messages         IS 'Messages du formulaire de contact public';
COMMENT ON TABLE subscription_reminders   IS 'Rappels expiration abonnements (anti-doublon applicatif)';
COMMENT ON VIEW  analytics_daily_summary  IS 'Métriques quotidiennes — colonne date (pas day)';

-- 1. Supprimer la contrainte UNIQUE sur business_id
ALTER TABLE business_payment_accounts 
  DROP CONSTRAINT business_payment_accounts_business_id_key;

-- 2. Ajouter les colonnes nécessaires
ALTER TABLE business_payment_accounts 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS account_label VARCHAR(100);

-- 3. S'assurer que les comptes existants sont marqués actifs
UPDATE business_payment_accounts SET is_active = true WHERE is_active IS NULL;

-- 4. Index pour retrouver rapidement le compte actif
CREATE INDEX IF NOT EXISTS idx_payment_accounts_active 
  ON business_payment_accounts(business_id, is_active) 
  WHERE is_active = true;

-- 5. Mettre à jour l'index existant (il référençait l'ancienne contrainte unique)
DROP INDEX IF EXISTS idx_payment_accounts_business_id;
CREATE INDEX IF NOT EXISTS idx_payment_accounts_business_id 
  ON business_payment_accounts(business_id);

-- À exécuter sur votre base PostgreSQL
ALTER TABLE business_branding
  ADD COLUMN IF NOT EXISTS cover_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS practical_note    TEXT,
  ADD COLUMN IF NOT EXISTS payment_methods   JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlights        JSONB DEFAULT '[]'::jsonb;

-- Index pour la cover
CREATE INDEX IF NOT EXISTS idx_business_branding_cover
  ON business_branding(business_id)
  WHERE cover_image_url IS NOT NULL;


-- À exécuter sur votre base PostgreSQL
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS latitude  DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS district  VARCHAR(100); -- quartier (Adidogomé, Agoè, Bè, etc.)

-- Index géographique pour les requêtes de proximité
CREATE INDEX IF NOT EXISTS idx_businesses_geo
  ON businesses(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_district
  ON businesses(district)
  WHERE district IS NOT NULL;


-- ============================================================
-- MIGRATION : Système de livraison
-- À exécuter sur la base PostgreSQL existante
-- ============================================================

-- 1. Ajouter le rôle 'driver' aux utilisateurs
-- ─────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('client','restaurant','traiteur','superadmin','driver'));

-- 2. Table drivers (profil livreur)
-- ─────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_id           INTEGER REFERENCES businesses(id) ON DELETE SET NULL,

  -- Qui a créé ce livreur
  created_by_type       VARCHAR(20) NOT NULL DEFAULT 'establishment'
                          CHECK (created_by_type IN ('admin','establishment')),
  created_by_id         INTEGER NOT NULL,

  -- Infos livreur
  vehicle_type          VARCHAR(20) DEFAULT 'moto'
                          CHECK (vehicle_type IN ('moto','velo','voiture','pied')),

  -- Capacité & statut opérationnel
  max_concurrent_orders INTEGER NOT NULL DEFAULT 3,
  status                VARCHAR(20) NOT NULL DEFAULT 'offline'
                          CHECK (status IN ('offline','available','at_capacity')),

  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_seen_at          TIMESTAMP WITH TIME ZONE,
  temp_password_used    BOOLEAN NOT NULL DEFAULT true, -- doit changer mdp au 1er login
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Table delivery_assignments
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id        INTEGER NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,

  assigned_by_type VARCHAR(20) NOT NULL
                     CHECK (assigned_by_type IN ('admin','establishment')),
  assigned_by_id   INTEGER NOT NULL,

  status           VARCHAR(20) NOT NULL DEFAULT 'assigned'
                     CHECK (status IN ('assigned','picked_up','delivered','failed')),

  assigned_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  picked_up_at     TIMESTAMP WITH TIME ZONE,
  delivered_at     TIMESTAMP WITH TIME ZONE,
  failed_at        TIMESTAMP WITH TIME ZONE,
  failure_reason   TEXT,
  proof_photo_url  TEXT,
  notes            TEXT,

  -- Une commande active = une seule assignation
  CONSTRAINT unique_active_order UNIQUE (order_id)
);

-- 4. Champs livraison dans orders
-- ────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) DEFAULT 'pending'
    CHECK (delivery_status IN (
      'pending',          -- commande reçue, pas encore prête
      'ready_for_pickup', -- prête, attend un livreur
      'assigned',         -- livreur assigné, pas parti
      'in_transit',       -- en route
      'delivered',        -- livré
      'failed'            -- échec
    )),
  ADD COLUMN IF NOT EXISTS current_assignment_id INTEGER
    REFERENCES delivery_assignments(id) ON DELETE SET NULL;

-- 5. Vue de disponibilité des livreurs
-- ─────────────────────────────────────
CREATE OR REPLACE VIEW driver_availability AS
SELECT
  d.id,
  d.user_id,
  d.business_id,
  d.vehicle_type,
  d.status                  AS raw_status,
  d.max_concurrent_orders,
  d.is_active,
  d.last_seen_at,
  u.first_name,
  u.last_name,
  u.phone,
  u.email,
  COUNT(da.id)              AS active_orders_count,
  d.max_concurrent_orders - COUNT(da.id) AS remaining_slots,
  CASE
    WHEN d.is_active = false              THEN 'inactive'
    WHEN d.status = 'offline'             THEN 'offline'
    WHEN COUNT(da.id) >= d.max_concurrent_orders THEN 'at_capacity'
    ELSE 'available'
  END                       AS real_status
FROM drivers d
JOIN users u ON d.user_id = u.id
LEFT JOIN delivery_assignments da
  ON da.driver_id = d.id
  AND da.status IN ('assigned','picked_up')
GROUP BY d.id, u.first_name, u.last_name, u.phone, u.email;

-- 6. Index de performance
-- ────────────────────────
CREATE INDEX IF NOT EXISTS idx_drivers_business     ON drivers(business_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status       ON drivers(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_assignments_order    ON delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_assignments_driver   ON delivery_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active   ON delivery_assignments(driver_id)
  WHERE status IN ('assigned','picked_up');
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status)
  WHERE delivery_status IN ('ready_for_pickup','assigned','in_transit');

-- 7. Trigger updated_at drivers
-- ───────────────────────────────
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Types de notifications supplémentaires
-- ──────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_order','new_reservation','payment_success','payment_failed',
    'delivery_confirmed','order_cancelled','reservation_cancelled',
    'driver_assigned','driver_picked_up','delivery_failed','payment_received'
  ));

-- Commentaires
COMMENT ON TABLE drivers              IS 'Livreurs (compte user + profil)';
COMMENT ON TABLE delivery_assignments IS 'Assignations livreur ↔ commande (historique complet)';
COMMENT ON VIEW  driver_availability  IS 'Disponibilité temps réel des livreurs';