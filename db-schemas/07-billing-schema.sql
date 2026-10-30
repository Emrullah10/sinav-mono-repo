-- billing schema (owner: billing service). Legal records: org nullable SET NULL, created_by/updated_by FK SET NULL.
-- Business column `code` of the plan is named `key` (<t>_key) because <t>_code is the standard global code.
-- Depends on: 00-enums, 01-identity, 02-storage, 05-content.

CREATE SCHEMA IF NOT EXISTS billing;

-- -----------------------------------------------------
-- Table: billing.product
-- Purpose: Sellable product (subscription or fixed-term pass)
-- -----------------------------------------------------
CREATE TABLE billing.product (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    product_tenant_code BIGINT NOT NULL,
    product_organization_id BIGINT NOT NULL,
    product_key VARCHAR(40) NOT NULL,
    product_name VARCHAR(120) NOT NULL,
    product_description TEXT,
    product_kind VARCHAR(100) NOT NULL,
    product_status VARCHAR(100) NOT NULL DEFAULT 'active',
    product_is_public BOOLEAN NOT NULL DEFAULT false,
    product_trial_days SMALLINT NOT NULL DEFAULT 0,
    product_badge_key VARCHAR(40),
    product_sort_order INTEGER NOT NULL DEFAULT 0,
    product_metadata JSONB NOT NULL DEFAULT '{}',
    product_created_by BIGINT,
    product_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    product_updated_by BIGINT,
    product_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_tenant_code_key UNIQUE (product_tenant_code, product_key),
    CONSTRAINT fk_product_tenant FOREIGN KEY (product_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_product_organization FOREIGN KEY (product_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_product_kind FOREIGN KEY (product_kind) REFERENCES enums.product_kind(product_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_product_status FOREIGN KEY (product_status) REFERENCES enums.product_status(product_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_product_created_by FOREIGN KEY (product_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_product_updated_by FOREIGN KEY (product_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_product_kind ON billing.product (product_kind);
CREATE INDEX idx_product_status ON billing.product (product_status);
CREATE INDEX idx_product_organization_id ON billing.product (product_organization_id);
CREATE INDEX idx_product_created_by ON billing.product (product_created_by);
CREATE INDEX idx_product_updated_by ON billing.product (product_updated_by);
CREATE TRIGGER trg_product_updated_at BEFORE UPDATE ON billing.product FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('product_updated_at');

-- -----------------------------------------------------
-- Table: billing.campaign
-- Purpose: Campaign such as founder presale
-- -----------------------------------------------------
CREATE TABLE billing.campaign (
    campaign_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    campaign_tenant_code BIGINT NOT NULL,
    campaign_organization_id BIGINT,
    campaign_key VARCHAR(40) NOT NULL,
    campaign_name VARCHAR(120) NOT NULL,
    campaign_kind VARCHAR(100) NOT NULL,
    campaign_status VARCHAR(100) NOT NULL DEFAULT 'active',
    campaign_capacity INTEGER,
    campaign_starts_at TIMESTAMPTZ,
    campaign_ends_at TIMESTAMPTZ,
    campaign_launch_date DATE,
    campaign_terms_md TEXT,
    campaign_metadata JSONB NOT NULL DEFAULT '{}',
    campaign_created_by BIGINT,
    campaign_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    campaign_updated_by BIGINT,
    campaign_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_campaign_tenant_code_key UNIQUE (campaign_tenant_code, campaign_key),
    CONSTRAINT chk_campaign_capacity CHECK (campaign_capacity IS NULL OR campaign_capacity > 0),
    CONSTRAINT chk_campaign_period CHECK (campaign_ends_at > campaign_starts_at),
    CONSTRAINT fk_campaign_tenant FOREIGN KEY (campaign_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_campaign_organization FOREIGN KEY (campaign_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_campaign_kind FOREIGN KEY (campaign_kind) REFERENCES enums.campaign_kind(campaign_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_campaign_status FOREIGN KEY (campaign_status) REFERENCES enums.product_status(product_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_campaign_created_by FOREIGN KEY (campaign_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_campaign_updated_by FOREIGN KEY (campaign_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_campaign_kind ON billing.campaign (campaign_kind);
CREATE INDEX idx_campaign_status ON billing.campaign (campaign_status);
CREATE INDEX idx_campaign_organization_id ON billing.campaign (campaign_organization_id);
CREATE INDEX idx_campaign_created_by ON billing.campaign (campaign_created_by);
CREATE INDEX idx_campaign_updated_by ON billing.campaign (campaign_updated_by);
CREATE TRIGGER trg_campaign_updated_at BEFORE UPDATE ON billing.campaign FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('campaign_updated_at');

-- -----------------------------------------------------
-- Table: billing.price
-- Purpose: Price history (existing subscribers keep old price)
-- -----------------------------------------------------
CREATE TABLE billing.price (
    price_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    price_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    price_tenant_code BIGINT NOT NULL,
    price_organization_id BIGINT,
    price_product_id BIGINT NOT NULL,
    price_campaign_id BIGINT,
    price_key VARCHAR(60) NOT NULL,
    price_amount DECIMAL(15,2) NOT NULL,
    price_currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    price_interval VARCHAR(100) NOT NULL,
    price_interval_count SMALLINT NOT NULL DEFAULT 1,
    price_period_end_rule VARCHAR(100) NOT NULL,
    price_max_installments SMALLINT NOT NULL DEFAULT 1,
    price_is_active BOOLEAN NOT NULL DEFAULT true,
    price_valid_from TIMESTAMPTZ NOT NULL,
    price_valid_to TIMESTAMPTZ,
    price_metadata JSONB NOT NULL DEFAULT '{}',
    price_created_by BIGINT,
    price_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    price_updated_by BIGINT,
    price_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_price_tenant_code_key UNIQUE (price_tenant_code, price_key),
    CONSTRAINT chk_price_amount CHECK (price_amount >= 0),
    CONSTRAINT chk_price_interval_count CHECK (price_interval_count > 0),
    CONSTRAINT chk_price_installments CHECK (price_max_installments BETWEEN 1 AND 12),
    CONSTRAINT chk_price_valid CHECK (price_valid_to IS NULL OR price_valid_to > price_valid_from),
    CONSTRAINT fk_price_tenant FOREIGN KEY (price_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_price_organization FOREIGN KEY (price_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_price_product FOREIGN KEY (price_product_id) REFERENCES billing.product(product_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_price_campaign FOREIGN KEY (price_campaign_id) REFERENCES billing.campaign(campaign_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_price_interval FOREIGN KEY (price_interval) REFERENCES enums.billing_interval(billing_interval_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_price_period_end_rule FOREIGN KEY (price_period_end_rule) REFERENCES enums.period_end_rule(period_end_rule_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_price_created_by FOREIGN KEY (price_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_price_updated_by FOREIGN KEY (price_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_price_product_id ON billing.price (price_product_id);
CREATE INDEX idx_price_campaign_id ON billing.price (price_campaign_id);
CREATE INDEX idx_price_interval ON billing.price (price_interval);
CREATE INDEX idx_price_period_end_rule ON billing.price (price_period_end_rule);
CREATE INDEX idx_price_is_active_valid_from ON billing.price (price_is_active, price_valid_from);
CREATE INDEX idx_price_organization_id ON billing.price (price_organization_id);
CREATE INDEX idx_price_created_by ON billing.price (price_created_by);
CREATE INDEX idx_price_updated_by ON billing.price (price_updated_by);
CREATE TRIGGER trg_price_updated_at BEFORE UPDATE ON billing.price FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('price_updated_at');

-- -----------------------------------------------------
-- Table: billing.product_feature
-- Purpose: Feature limits per product (including free tier)
-- -----------------------------------------------------
CREATE TABLE billing.product_feature (
    product_feature_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_feature_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    product_feature_tenant_code BIGINT NOT NULL,
    product_feature_organization_id BIGINT,
    product_feature_product_id BIGINT NOT NULL,
    product_feature_feature VARCHAR(100) NOT NULL,
    product_feature_limit_value INTEGER,
    product_feature_limit_period VARCHAR(100),
    product_feature_is_enabled BOOLEAN NOT NULL DEFAULT true,
    product_feature_metadata JSONB NOT NULL DEFAULT '{}',
    product_feature_created_by BIGINT,
    product_feature_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    product_feature_updated_by BIGINT,
    product_feature_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_feature_product_id_feature UNIQUE (product_feature_product_id, product_feature_feature),
    CONSTRAINT chk_product_feature_limit CHECK (product_feature_limit_value IS NULL OR (product_feature_limit_value >= 0 AND product_feature_limit_period IS NOT NULL)),
    CONSTRAINT fk_product_feature_tenant FOREIGN KEY (product_feature_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_product_feature_organization FOREIGN KEY (product_feature_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_product_feature_product FOREIGN KEY (product_feature_product_id) REFERENCES billing.product(product_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_product_feature_feature FOREIGN KEY (product_feature_feature) REFERENCES enums.feature(feature_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_product_feature_limit_period FOREIGN KEY (product_feature_limit_period) REFERENCES enums.limit_period(limit_period_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_product_feature_created_by FOREIGN KEY (product_feature_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_product_feature_updated_by FOREIGN KEY (product_feature_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_product_feature_feature ON billing.product_feature (product_feature_feature);
CREATE INDEX idx_product_feature_limit_period ON billing.product_feature (product_feature_limit_period);
CREATE INDEX idx_product_feature_tenant_code ON billing.product_feature (product_feature_tenant_code);
CREATE INDEX idx_product_feature_organization_id ON billing.product_feature (product_feature_organization_id);
CREATE INDEX idx_product_feature_created_by ON billing.product_feature (product_feature_created_by);
CREATE INDEX idx_product_feature_updated_by ON billing.product_feature (product_feature_updated_by);
CREATE TRIGGER trg_product_feature_updated_at BEFORE UPDATE ON billing.product_feature FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('product_feature_updated_at');

-- -----------------------------------------------------
-- Table: billing.billing_profile
-- Purpose: Invoice identity of a user
-- -----------------------------------------------------
CREATE TABLE billing.billing_profile (
    billing_profile_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_profile_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    billing_profile_tenant_code BIGINT NOT NULL,
    billing_profile_organization_id BIGINT NOT NULL,
    billing_profile_user_account_id BIGINT NOT NULL,
    billing_profile_party_type VARCHAR(100) NOT NULL,
    billing_profile_full_name VARCHAR(150) NOT NULL,
    billing_profile_company_title VARCHAR(200),
    billing_profile_tax_office VARCHAR(100),
    billing_profile_tax_number VARCHAR(20),
    billing_profile_national_id VARCHAR(11),
    billing_profile_email VARCHAR(254),
    billing_profile_address_line VARCHAR(300) NOT NULL,
    billing_profile_district VARCHAR(80),
    billing_profile_city VARCHAR(80) NOT NULL,
    billing_profile_postal_code VARCHAR(10),
    billing_profile_country VARCHAR(2) NOT NULL DEFAULT 'TR',
    billing_profile_is_default BOOLEAN NOT NULL DEFAULT false,
    billing_profile_metadata JSONB NOT NULL DEFAULT '{}',
    billing_profile_created_by BIGINT,
    billing_profile_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    billing_profile_updated_by BIGINT,
    billing_profile_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_billing_profile_party CHECK (billing_profile_party_type = 'individual' OR (billing_profile_company_title IS NOT NULL AND billing_profile_tax_office IS NOT NULL AND billing_profile_tax_number IS NOT NULL)),
    CONSTRAINT fk_billing_profile_tenant FOREIGN KEY (billing_profile_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_billing_profile_organization FOREIGN KEY (billing_profile_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_billing_profile_user_account FOREIGN KEY (billing_profile_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_billing_profile_party_type FOREIGN KEY (billing_profile_party_type) REFERENCES enums.billing_party_type(billing_party_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_billing_profile_created_by FOREIGN KEY (billing_profile_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_billing_profile_updated_by FOREIGN KEY (billing_profile_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_billing_profile_default ON billing.billing_profile (billing_profile_user_account_id) WHERE billing_profile_is_default;
CREATE INDEX idx_billing_profile_user_account_id ON billing.billing_profile (billing_profile_user_account_id);
CREATE INDEX idx_billing_profile_party_type ON billing.billing_profile (billing_profile_party_type);
CREATE INDEX idx_billing_profile_tenant_code ON billing.billing_profile (billing_profile_tenant_code);
CREATE INDEX idx_billing_profile_organization_id ON billing.billing_profile (billing_profile_organization_id);
CREATE INDEX idx_billing_profile_created_by ON billing.billing_profile (billing_profile_created_by);
CREATE INDEX idx_billing_profile_updated_by ON billing.billing_profile (billing_profile_updated_by);
CREATE TRIGGER trg_billing_profile_updated_at BEFORE UPDATE ON billing.billing_profile FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('billing_profile_updated_at');

-- -----------------------------------------------------
-- Table: billing.payment_method
-- Purpose: Tokenized card
-- -----------------------------------------------------
CREATE TABLE billing.payment_method (
    payment_method_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_method_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    payment_method_tenant_code BIGINT NOT NULL,
    payment_method_organization_id BIGINT NOT NULL,
    payment_method_user_account_id BIGINT NOT NULL,
    payment_method_provider VARCHAR(100) NOT NULL,
    payment_method_status VARCHAR(100) NOT NULL DEFAULT 'active',
    payment_method_provider_token VARCHAR(255) NOT NULL,
    payment_method_card_brand VARCHAR(20),
    payment_method_card_last4 VARCHAR(4),
    payment_method_exp_month SMALLINT,
    payment_method_exp_year SMALLINT,
    payment_method_holder_name VARCHAR(120),
    payment_method_is_default BOOLEAN NOT NULL DEFAULT false,
    payment_method_removed_at TIMESTAMPTZ,
    payment_method_metadata JSONB NOT NULL DEFAULT '{}',
    payment_method_created_by BIGINT,
    payment_method_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payment_method_updated_by BIGINT,
    payment_method_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payment_method_provider_provider_token UNIQUE (payment_method_provider, payment_method_provider_token),
    CONSTRAINT chk_payment_method_last4 CHECK (payment_method_card_last4 ~ '^[0-9][0-9][0-9][0-9]$'),
    CONSTRAINT chk_payment_method_exp_month CHECK (payment_method_exp_month BETWEEN 1 AND 12),
    CONSTRAINT fk_payment_method_tenant FOREIGN KEY (payment_method_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_method_organization FOREIGN KEY (payment_method_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_method_user_account FOREIGN KEY (payment_method_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_method_provider FOREIGN KEY (payment_method_provider) REFERENCES enums.payment_provider(payment_provider_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_method_status FOREIGN KEY (payment_method_status) REFERENCES enums.payment_method_status(payment_method_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_method_created_by FOREIGN KEY (payment_method_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_method_updated_by FOREIGN KEY (payment_method_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_payment_method_default ON billing.payment_method (payment_method_user_account_id) WHERE payment_method_is_default AND payment_method_status='active';
CREATE INDEX idx_payment_method_user_account_id ON billing.payment_method (payment_method_user_account_id);
CREATE INDEX idx_payment_method_status ON billing.payment_method (payment_method_status);
CREATE INDEX idx_payment_method_tenant_code ON billing.payment_method (payment_method_tenant_code);
CREATE INDEX idx_payment_method_organization_id ON billing.payment_method (payment_method_organization_id);
CREATE INDEX idx_payment_method_created_by ON billing.payment_method (payment_method_created_by);
CREATE INDEX idx_payment_method_updated_by ON billing.payment_method (payment_method_updated_by);
CREATE TRIGGER trg_payment_method_updated_at BEFORE UPDATE ON billing.payment_method FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('payment_method_updated_at');

-- -----------------------------------------------------
-- Table: billing.subscription
-- Purpose: User subscription
-- -----------------------------------------------------
CREATE TABLE billing.subscription (
    subscription_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    subscription_tenant_code BIGINT NOT NULL,
    subscription_organization_id BIGINT,
    subscription_user_account_id BIGINT,
    subscription_product_id BIGINT NOT NULL,
    subscription_price_id BIGINT NOT NULL,
    subscription_status VARCHAR(100) NOT NULL,
    subscription_channel VARCHAR(100) NOT NULL DEFAULT 'web',
    subscription_current_period_start TIMESTAMPTZ NOT NULL,
    subscription_current_period_end TIMESTAMPTZ NOT NULL,
    subscription_trial_ends_at TIMESTAMPTZ,
    subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    subscription_canceled_at TIMESTAMPTZ,
    subscription_cancel_reason VARCHAR(100),
    subscription_cancel_note VARCHAR(1000),
    subscription_paused_until DATE,
    subscription_exam_session_id BIGINT,
    subscription_payment_method_id BIGINT,
    subscription_locked_amount DECIMAL(15,2),
    subscription_provider_ref VARCHAR(120),
    subscription_renewal_attempts SMALLINT NOT NULL DEFAULT 0,
    subscription_metadata JSONB NOT NULL DEFAULT '{}',
    subscription_created_by BIGINT,
    subscription_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    subscription_updated_by BIGINT,
    subscription_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_subscription_period CHECK (subscription_current_period_end > subscription_current_period_start),
    CONSTRAINT fk_subscription_tenant FOREIGN KEY (subscription_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_organization FOREIGN KEY (subscription_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_user_account FOREIGN KEY (subscription_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_product FOREIGN KEY (subscription_product_id) REFERENCES billing.product(product_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_price FOREIGN KEY (subscription_price_id) REFERENCES billing.price(price_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_status FOREIGN KEY (subscription_status) REFERENCES enums.subscription_status(subscription_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_channel FOREIGN KEY (subscription_channel) REFERENCES enums.sales_channel(sales_channel_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_cancel_reason FOREIGN KEY (subscription_cancel_reason) REFERENCES enums.cancel_reason(cancel_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_exam_session FOREIGN KEY (subscription_exam_session_id) REFERENCES content.exam_session(exam_session_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_payment_method FOREIGN KEY (subscription_payment_method_id) REFERENCES billing.payment_method(payment_method_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_created_by FOREIGN KEY (subscription_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_updated_by FOREIGN KEY (subscription_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_subscription_live ON billing.subscription (subscription_user_account_id) WHERE subscription_status IN ('trialing','active','past_due','paused');
CREATE INDEX idx_subscription_user_account_id ON billing.subscription (subscription_user_account_id);
CREATE INDEX idx_subscription_product_id ON billing.subscription (subscription_product_id);
CREATE INDEX idx_subscription_price_id ON billing.subscription (subscription_price_id);
CREATE INDEX idx_subscription_status_current_period_end ON billing.subscription (subscription_status, subscription_current_period_end);
CREATE INDEX idx_subscription_channel ON billing.subscription (subscription_channel);
CREATE INDEX idx_subscription_cancel_reason ON billing.subscription (subscription_cancel_reason);
CREATE INDEX idx_subscription_exam_session_id ON billing.subscription (subscription_exam_session_id);
CREATE INDEX idx_subscription_payment_method_id ON billing.subscription (subscription_payment_method_id);
CREATE INDEX idx_subscription_tenant_code ON billing.subscription (subscription_tenant_code);
CREATE INDEX idx_subscription_organization_id ON billing.subscription (subscription_organization_id);
CREATE INDEX idx_subscription_created_by ON billing.subscription (subscription_created_by);
CREATE INDEX idx_subscription_updated_by ON billing.subscription (subscription_updated_by);
CREATE TRIGGER trg_subscription_updated_at BEFORE UPDATE ON billing.subscription FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('subscription_updated_at');

-- -----------------------------------------------------
-- Table: billing.coupon
-- Purpose: Discount coupon
-- -----------------------------------------------------
CREATE TABLE billing.coupon (
    coupon_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coupon_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    coupon_tenant_code BIGINT NOT NULL,
    coupon_organization_id BIGINT,
    coupon_key VARCHAR(40) NOT NULL,
    coupon_discount_type VARCHAR(100) NOT NULL,
    coupon_discount_value DECIMAL(15,2) NOT NULL,
    coupon_currency VARCHAR(3),
    coupon_status VARCHAR(100) NOT NULL DEFAULT 'active',
    coupon_valid_from TIMESTAMPTZ,
    coupon_valid_to TIMESTAMPTZ,
    coupon_max_redemptions INTEGER,
    coupon_per_user_limit SMALLINT NOT NULL DEFAULT 1,
    coupon_metadata JSONB NOT NULL DEFAULT '{}',
    coupon_created_by BIGINT,
    coupon_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    coupon_updated_by BIGINT,
    coupon_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_coupon_tenant_code_key UNIQUE (coupon_tenant_code, coupon_key),
    CONSTRAINT chk_coupon_value CHECK (coupon_discount_value > 0),
    CONSTRAINT chk_coupon_percent CHECK (coupon_discount_type <> 'percent' OR coupon_discount_value <= 100),
    CONSTRAINT fk_coupon_tenant FOREIGN KEY (coupon_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_organization FOREIGN KEY (coupon_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_discount_type FOREIGN KEY (coupon_discount_type) REFERENCES enums.coupon_discount_type(coupon_discount_type_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_coupon_status FOREIGN KEY (coupon_status) REFERENCES enums.product_status(product_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_coupon_created_by FOREIGN KEY (coupon_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_updated_by FOREIGN KEY (coupon_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_coupon_discount_type ON billing.coupon (coupon_discount_type);
CREATE INDEX idx_coupon_status ON billing.coupon (coupon_status);
CREATE INDEX idx_coupon_organization_id ON billing.coupon (coupon_organization_id);
CREATE INDEX idx_coupon_created_by ON billing.coupon (coupon_created_by);
CREATE INDEX idx_coupon_updated_by ON billing.coupon (coupon_updated_by);
CREATE TRIGGER trg_coupon_updated_at BEFORE UPDATE ON billing.coupon FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('coupon_updated_at');

-- -----------------------------------------------------
-- Table: billing.coupon_product
-- Purpose: Coupon product restriction (no rows = all products)
-- -----------------------------------------------------
CREATE TABLE billing.coupon_product (
    coupon_product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coupon_product_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    coupon_product_tenant_code BIGINT NOT NULL,
    coupon_product_organization_id BIGINT,
    coupon_product_coupon_id BIGINT NOT NULL,
    coupon_product_product_id BIGINT NOT NULL,
    coupon_product_metadata JSONB NOT NULL DEFAULT '{}',
    coupon_product_created_by BIGINT,
    coupon_product_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    coupon_product_updated_by BIGINT,
    coupon_product_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_coupon_product_coupon_id_product_id UNIQUE (coupon_product_coupon_id, coupon_product_product_id),
    CONSTRAINT fk_coupon_product_tenant FOREIGN KEY (coupon_product_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_product_organization FOREIGN KEY (coupon_product_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_product_coupon FOREIGN KEY (coupon_product_coupon_id) REFERENCES billing.coupon(coupon_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_product_product FOREIGN KEY (coupon_product_product_id) REFERENCES billing.product(product_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_product_created_by FOREIGN KEY (coupon_product_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_product_updated_by FOREIGN KEY (coupon_product_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_coupon_product_product_id ON billing.coupon_product (coupon_product_product_id);
CREATE INDEX idx_coupon_product_tenant_code ON billing.coupon_product (coupon_product_tenant_code);
CREATE INDEX idx_coupon_product_organization_id ON billing.coupon_product (coupon_product_organization_id);
CREATE INDEX idx_coupon_product_created_by ON billing.coupon_product (coupon_product_created_by);
CREATE INDEX idx_coupon_product_updated_by ON billing.coupon_product (coupon_product_updated_by);
CREATE TRIGGER trg_coupon_product_updated_at BEFORE UPDATE ON billing.coupon_product FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('coupon_product_updated_at');

-- -----------------------------------------------------
-- Table: billing.payment
-- Purpose: Payment attempt and result
-- -----------------------------------------------------
CREATE TABLE billing.payment (
    payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    payment_tenant_code BIGINT NOT NULL,
    payment_organization_id BIGINT,
    payment_user_account_id BIGINT,
    payment_subscription_id BIGINT,
    payment_price_id BIGINT NOT NULL,
    payment_campaign_id BIGINT,
    payment_coupon_id BIGINT,
    payment_payment_method_id BIGINT,
    payment_provider VARCHAR(100) NOT NULL,
    payment_status VARCHAR(100) NOT NULL DEFAULT 'pending',
    payment_amount DECIMAL(15,2) NOT NULL,
    payment_discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    payment_installment_count SMALLINT NOT NULL DEFAULT 1,
    payment_idempotency_key VARCHAR(80) NOT NULL,
    payment_provider_payment_id VARCHAR(120),
    payment_action_url VARCHAR(500),
    payment_failure_code VARCHAR(60),
    payment_failure_reason_key VARCHAR(80),
    payment_pre_info_document_id BIGINT NOT NULL,
    payment_distance_sales_document_id BIGINT NOT NULL,
    payment_consents_accepted_at TIMESTAMPTZ NOT NULL,
    payment_paid_at TIMESTAMPTZ,
    payment_refunded_at TIMESTAMPTZ,
    payment_billing_snapshot JSONB NOT NULL,
    payment_metadata JSONB NOT NULL DEFAULT '{}',
    payment_created_by BIGINT,
    payment_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payment_updated_by BIGINT,
    payment_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payment_idempotency_key UNIQUE (payment_idempotency_key),
    CONSTRAINT chk_payment_amount CHECK (payment_amount >= 0),
    CONSTRAINT chk_payment_installments CHECK (payment_installment_count BETWEEN 1 AND 12),
    CONSTRAINT fk_payment_tenant FOREIGN KEY (payment_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_organization FOREIGN KEY (payment_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_user_account FOREIGN KEY (payment_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_subscription FOREIGN KEY (payment_subscription_id) REFERENCES billing.subscription(subscription_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_price FOREIGN KEY (payment_price_id) REFERENCES billing.price(price_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_campaign FOREIGN KEY (payment_campaign_id) REFERENCES billing.campaign(campaign_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_coupon FOREIGN KEY (payment_coupon_id) REFERENCES billing.coupon(coupon_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_payment_method FOREIGN KEY (payment_payment_method_id) REFERENCES billing.payment_method(payment_method_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_provider FOREIGN KEY (payment_provider) REFERENCES enums.payment_provider(payment_provider_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_status FOREIGN KEY (payment_status) REFERENCES enums.payment_status(payment_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_pre_info_document FOREIGN KEY (payment_pre_info_document_id) REFERENCES identity.legal_document(legal_document_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_distance_sales_document FOREIGN KEY (payment_distance_sales_document_id) REFERENCES identity.legal_document(legal_document_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_created_by FOREIGN KEY (payment_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_payment_updated_by FOREIGN KEY (payment_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_payment_provider_payment ON billing.payment (payment_provider, payment_provider_payment_id) WHERE payment_provider_payment_id IS NOT NULL;
CREATE INDEX idx_payment_user_account_id ON billing.payment (payment_user_account_id);
CREATE INDEX idx_payment_subscription_id ON billing.payment (payment_subscription_id);
CREATE INDEX idx_payment_price_id ON billing.payment (payment_price_id);
CREATE INDEX idx_payment_campaign_id ON billing.payment (payment_campaign_id);
CREATE INDEX idx_payment_coupon_id ON billing.payment (payment_coupon_id);
CREATE INDEX idx_payment_payment_method_id ON billing.payment (payment_payment_method_id);
CREATE INDEX idx_payment_provider ON billing.payment (payment_provider);
CREATE INDEX idx_payment_status_created_at ON billing.payment (payment_status, payment_created_at);
CREATE INDEX idx_payment_pre_info_document_id ON billing.payment (payment_pre_info_document_id);
CREATE INDEX idx_payment_distance_sales_document_id ON billing.payment (payment_distance_sales_document_id);
CREATE INDEX idx_payment_tenant_code ON billing.payment (payment_tenant_code);
CREATE INDEX idx_payment_organization_id ON billing.payment (payment_organization_id);
CREATE INDEX idx_payment_created_by ON billing.payment (payment_created_by);
CREATE INDEX idx_payment_updated_by ON billing.payment (payment_updated_by);
CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON billing.payment FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('payment_updated_at');

-- -----------------------------------------------------
-- Table: billing.coupon_redemption
-- Purpose: Coupon use record
-- -----------------------------------------------------
CREATE TABLE billing.coupon_redemption (
    coupon_redemption_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coupon_redemption_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    coupon_redemption_tenant_code BIGINT NOT NULL,
    coupon_redemption_organization_id BIGINT,
    coupon_redemption_coupon_id BIGINT NOT NULL,
    coupon_redemption_payment_id BIGINT NOT NULL,
    coupon_redemption_user_account_id BIGINT,
    coupon_redemption_metadata JSONB NOT NULL DEFAULT '{}',
    coupon_redemption_created_by BIGINT,
    coupon_redemption_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    coupon_redemption_updated_by BIGINT,
    coupon_redemption_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_coupon_redemption_payment_id UNIQUE (coupon_redemption_payment_id),
    CONSTRAINT fk_coupon_redemption_tenant FOREIGN KEY (coupon_redemption_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_organization FOREIGN KEY (coupon_redemption_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_coupon FOREIGN KEY (coupon_redemption_coupon_id) REFERENCES billing.coupon(coupon_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_payment FOREIGN KEY (coupon_redemption_payment_id) REFERENCES billing.payment(payment_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_user_account FOREIGN KEY (coupon_redemption_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_created_by FOREIGN KEY (coupon_redemption_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_coupon_redemption_updated_by FOREIGN KEY (coupon_redemption_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_coupon_redemption_coupon_id ON billing.coupon_redemption (coupon_redemption_coupon_id);
CREATE INDEX idx_coupon_redemption_user_account_id ON billing.coupon_redemption (coupon_redemption_user_account_id);
CREATE INDEX idx_coupon_redemption_tenant_code ON billing.coupon_redemption (coupon_redemption_tenant_code);
CREATE INDEX idx_coupon_redemption_organization_id ON billing.coupon_redemption (coupon_redemption_organization_id);
CREATE INDEX idx_coupon_redemption_created_by ON billing.coupon_redemption (coupon_redemption_created_by);
CREATE INDEX idx_coupon_redemption_updated_by ON billing.coupon_redemption (coupon_redemption_updated_by);
CREATE TRIGGER trg_coupon_redemption_updated_at BEFORE UPDATE ON billing.coupon_redemption FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('coupon_redemption_updated_at');

-- -----------------------------------------------------
-- Table: billing.invoice
-- Purpose: Invoice (e-Archive integrator pending; stays pending_issue)
-- -----------------------------------------------------
CREATE TABLE billing.invoice (
    invoice_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    invoice_tenant_code BIGINT NOT NULL,
    invoice_organization_id BIGINT,
    invoice_payment_id BIGINT NOT NULL,
    invoice_user_account_id BIGINT,
    invoice_status VARCHAR(100) NOT NULL DEFAULT 'pending_issue',
    invoice_invoice_number VARCHAR(40),
    invoice_subtotal DECIMAL(15,2),
    invoice_tax_amount DECIMAL(15,2),
    invoice_total DECIMAL(15,2),
    invoice_currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    invoice_issued_at TIMESTAMPTZ,
    invoice_provider_ref VARCHAR(120),
    invoice_pdf_blob_id BIGINT,
    invoice_billing_snapshot JSONB NOT NULL,
    invoice_metadata JSONB NOT NULL DEFAULT '{}',
    invoice_created_by BIGINT,
    invoice_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    invoice_updated_by BIGINT,
    invoice_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_invoice_tenant FOREIGN KEY (invoice_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_organization FOREIGN KEY (invoice_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_payment FOREIGN KEY (invoice_payment_id) REFERENCES billing.payment(payment_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_user_account FOREIGN KEY (invoice_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_status FOREIGN KEY (invoice_status) REFERENCES enums.invoice_status(invoice_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_invoice_pdf_blob FOREIGN KEY (invoice_pdf_blob_id) REFERENCES storage.blob(blob_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_created_by FOREIGN KEY (invoice_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_invoice_updated_by FOREIGN KEY (invoice_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_invoice_number ON billing.invoice (invoice_tenant_code, invoice_invoice_number) WHERE invoice_invoice_number IS NOT NULL;
CREATE INDEX idx_invoice_payment_id ON billing.invoice (invoice_payment_id);
CREATE INDEX idx_invoice_user_account_id ON billing.invoice (invoice_user_account_id);
CREATE INDEX idx_invoice_status ON billing.invoice (invoice_status);
CREATE INDEX idx_invoice_pdf_blob_id ON billing.invoice (invoice_pdf_blob_id);
CREATE INDEX idx_invoice_tenant_code ON billing.invoice (invoice_tenant_code);
CREATE INDEX idx_invoice_organization_id ON billing.invoice (invoice_organization_id);
CREATE INDEX idx_invoice_created_by ON billing.invoice (invoice_created_by);
CREATE INDEX idx_invoice_updated_by ON billing.invoice (invoice_updated_by);
CREATE TRIGGER trg_invoice_updated_at BEFORE UPDATE ON billing.invoice FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('invoice_updated_at');

-- -----------------------------------------------------
-- Table: billing.entitlement_grant
-- Purpose: Access grant (union of active grants = access)
-- -----------------------------------------------------
CREATE TABLE billing.entitlement_grant (
    entitlement_grant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entitlement_grant_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    entitlement_grant_tenant_code BIGINT NOT NULL,
    entitlement_grant_organization_id BIGINT NOT NULL,
    entitlement_grant_user_account_id BIGINT NOT NULL,
    entitlement_grant_product_id BIGINT NOT NULL,
    entitlement_grant_source VARCHAR(100) NOT NULL,
    entitlement_grant_subscription_id BIGINT,
    entitlement_grant_source_ref VARCHAR(120),
    entitlement_grant_starts_at TIMESTAMPTZ NOT NULL,
    entitlement_grant_ends_at TIMESTAMPTZ,
    entitlement_grant_revoked_at TIMESTAMPTZ,
    entitlement_grant_metadata JSONB NOT NULL DEFAULT '{}',
    entitlement_grant_created_by BIGINT,
    entitlement_grant_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    entitlement_grant_updated_by BIGINT,
    entitlement_grant_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_entitlement_grant_period CHECK (entitlement_grant_ends_at IS NULL OR entitlement_grant_ends_at > entitlement_grant_starts_at),
    CONSTRAINT fk_entitlement_grant_tenant FOREIGN KEY (entitlement_grant_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_organization FOREIGN KEY (entitlement_grant_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_user_account FOREIGN KEY (entitlement_grant_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_product FOREIGN KEY (entitlement_grant_product_id) REFERENCES billing.product(product_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_source FOREIGN KEY (entitlement_grant_source) REFERENCES enums.grant_source(grant_source_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_entitlement_grant_subscription FOREIGN KEY (entitlement_grant_subscription_id) REFERENCES billing.subscription(subscription_id) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_created_by FOREIGN KEY (entitlement_grant_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_entitlement_grant_updated_by FOREIGN KEY (entitlement_grant_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_entitlement_grant_user_account_id_ends_at ON billing.entitlement_grant (entitlement_grant_user_account_id, entitlement_grant_ends_at);
CREATE INDEX idx_entitlement_grant_product_id ON billing.entitlement_grant (entitlement_grant_product_id);
CREATE INDEX idx_entitlement_grant_source ON billing.entitlement_grant (entitlement_grant_source);
CREATE INDEX idx_entitlement_grant_subscription_id ON billing.entitlement_grant (entitlement_grant_subscription_id);
CREATE INDEX idx_entitlement_grant_tenant_code ON billing.entitlement_grant (entitlement_grant_tenant_code);
CREATE INDEX idx_entitlement_grant_organization_id ON billing.entitlement_grant (entitlement_grant_organization_id);
CREATE INDEX idx_entitlement_grant_created_by ON billing.entitlement_grant (entitlement_grant_created_by);
CREATE INDEX idx_entitlement_grant_updated_by ON billing.entitlement_grant (entitlement_grant_updated_by);
CREATE TRIGGER trg_entitlement_grant_updated_at BEFORE UPDATE ON billing.entitlement_grant FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('entitlement_grant_updated_at');

-- -----------------------------------------------------
-- Table: billing.retention_offer
-- Purpose: Cancellation retention offer
-- -----------------------------------------------------
CREATE TABLE billing.retention_offer (
    retention_offer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    retention_offer_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    retention_offer_tenant_code BIGINT NOT NULL,
    retention_offer_organization_id BIGINT NOT NULL,
    retention_offer_cancel_reason VARCHAR(100) NOT NULL,
    retention_offer_kind VARCHAR(100) NOT NULL,
    retention_offer_price_id BIGINT,
    retention_offer_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    retention_offer_title VARCHAR(120) NOT NULL,
    retention_offer_body VARCHAR(400) NOT NULL,
    retention_offer_is_active BOOLEAN NOT NULL DEFAULT true,
    retention_offer_sort_order INTEGER NOT NULL DEFAULT 0,
    retention_offer_metadata JSONB NOT NULL DEFAULT '{}',
    retention_offer_created_by BIGINT,
    retention_offer_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retention_offer_updated_by BIGINT,
    retention_offer_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_retention_offer_cancel_reason_kind UNIQUE (retention_offer_cancel_reason, retention_offer_kind),
    CONSTRAINT fk_retention_offer_tenant FOREIGN KEY (retention_offer_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_retention_offer_organization FOREIGN KEY (retention_offer_organization_id) REFERENCES identity.organization(organization_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_retention_offer_cancel_reason FOREIGN KEY (retention_offer_cancel_reason) REFERENCES enums.cancel_reason(cancel_reason_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_retention_offer_kind FOREIGN KEY (retention_offer_kind) REFERENCES enums.retention_offer_kind(retention_offer_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_retention_offer_price FOREIGN KEY (retention_offer_price_id) REFERENCES billing.price(price_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_retention_offer_created_by FOREIGN KEY (retention_offer_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_retention_offer_updated_by FOREIGN KEY (retention_offer_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_retention_offer_kind ON billing.retention_offer (retention_offer_kind);
CREATE INDEX idx_retention_offer_price_id ON billing.retention_offer (retention_offer_price_id);
CREATE INDEX idx_retention_offer_tenant_code ON billing.retention_offer (retention_offer_tenant_code);
CREATE INDEX idx_retention_offer_organization_id ON billing.retention_offer (retention_offer_organization_id);
CREATE INDEX idx_retention_offer_created_by ON billing.retention_offer (retention_offer_created_by);
CREATE INDEX idx_retention_offer_updated_by ON billing.retention_offer (retention_offer_updated_by);
CREATE TRIGGER trg_retention_offer_updated_at BEFORE UPDATE ON billing.retention_offer FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('retention_offer_updated_at');

-- -----------------------------------------------------
-- Table: billing.store_product
-- Purpose: Mağaza ürün kimliği (RevenueCat product_id) → billing.product eşlemesi
-- -----------------------------------------------------
CREATE TABLE billing.store_product (
    store_product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store_product_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    store_product_tenant_code BIGINT NOT NULL,
    store_product_organization_id BIGINT,
    store_product_product_id BIGINT NOT NULL,
    store_product_channel VARCHAR(100) NOT NULL,
    store_product_store_id VARCHAR(120) NOT NULL,
    store_product_is_active BOOLEAN NOT NULL DEFAULT true,
    store_product_metadata JSONB NOT NULL DEFAULT '{}',
    store_product_created_by BIGINT,
    store_product_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    store_product_updated_by BIGINT,
    store_product_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_store_product_channel CHECK (store_product_channel IN ('app_store','google_play')),
    CONSTRAINT uq_store_product_channel_store_id UNIQUE (store_product_channel, store_product_store_id),
    CONSTRAINT fk_store_product_tenant FOREIGN KEY (store_product_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_store_product_organization FOREIGN KEY (store_product_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_store_product_product FOREIGN KEY (store_product_product_id) REFERENCES billing.product(product_id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_store_product_channel FOREIGN KEY (store_product_channel) REFERENCES enums.sales_channel(sales_channel_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_store_product_created_by FOREIGN KEY (store_product_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_store_product_updated_by FOREIGN KEY (store_product_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_store_product_product_id ON billing.store_product (store_product_product_id);
CREATE INDEX idx_store_product_tenant_code ON billing.store_product (store_product_tenant_code);
CREATE INDEX idx_store_product_organization_id ON billing.store_product (store_product_organization_id);
CREATE INDEX idx_store_product_created_by ON billing.store_product (store_product_created_by);
CREATE INDEX idx_store_product_updated_by ON billing.store_product (store_product_updated_by);
CREATE TRIGGER trg_store_product_updated_at BEFORE UPDATE ON billing.store_product FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('store_product_updated_at');

-- -----------------------------------------------------
-- Table: billing.provider_event
-- Purpose: Webhook/callback idempotency log
-- -----------------------------------------------------
CREATE TABLE billing.provider_event (
    provider_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_event_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    provider_event_tenant_code BIGINT NOT NULL,
    provider_event_organization_id BIGINT,
    provider_event_provider VARCHAR(100) NOT NULL,
    provider_event_event_id VARCHAR(120) NOT NULL,
    provider_event_event_type VARCHAR(80),
    provider_event_status VARCHAR(100) NOT NULL DEFAULT 'received',
    provider_event_signature_valid BOOLEAN NOT NULL,
    provider_event_payload JSONB NOT NULL,
    provider_event_payment_id BIGINT,
    provider_event_processed_at TIMESTAMPTZ,
    provider_event_error TEXT,
    provider_event_metadata JSONB NOT NULL DEFAULT '{}',
    provider_event_created_by BIGINT,
    provider_event_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_event_updated_by BIGINT,
    provider_event_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_provider_event_provider_event_id UNIQUE (provider_event_provider, provider_event_event_id),
    CONSTRAINT fk_provider_event_tenant FOREIGN KEY (provider_event_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT fk_provider_event_organization FOREIGN KEY (provider_event_organization_id) REFERENCES identity.organization(organization_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_provider_event_provider FOREIGN KEY (provider_event_provider) REFERENCES enums.payment_provider(payment_provider_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_provider_event_status FOREIGN KEY (provider_event_status) REFERENCES enums.provider_event_status(provider_event_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_provider_event_payment FOREIGN KEY (provider_event_payment_id) REFERENCES billing.payment(payment_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_provider_event_created_by FOREIGN KEY (provider_event_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_provider_event_updated_by FOREIGN KEY (provider_event_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX idx_provider_event_status ON billing.provider_event (provider_event_status);
CREATE INDEX idx_provider_event_payment_id ON billing.provider_event (provider_event_payment_id);
CREATE INDEX idx_provider_event_tenant_code ON billing.provider_event (provider_event_tenant_code);
CREATE INDEX idx_provider_event_organization_id ON billing.provider_event (provider_event_organization_id);
CREATE INDEX idx_provider_event_created_by ON billing.provider_event (provider_event_created_by);
CREATE INDEX idx_provider_event_updated_by ON billing.provider_event (provider_event_updated_by);
CREATE TRIGGER trg_provider_event_updated_at BEFORE UPDATE ON billing.provider_event FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at('provider_event_updated_at');

