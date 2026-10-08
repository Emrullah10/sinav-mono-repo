-- P0 başlangıç şeması: 03-notify-schema.sql (docs/PLAN-P0.md §2).
--
-- NEDEN: çalışan veritabanlarının taze kurulumla aynı şemaya ulaşması.
-- Idempotent değil; defter (public.schema_migrations) her dosyayı bir kez çalıştırır.
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-08-4-p0-notify.sql
BEGIN;

-- =====================================================
-- SCHEMA: notify
-- Purpose: Notification preferences, devices, notifications and deliveries
-- =====================================================
CREATE SCHEMA IF NOT EXISTS notify;

-- -----------------------------------------------------
-- Table: notify.preference
-- Purpose: Per-user notification preferences and quiet hours (1:1).
-- -----------------------------------------------------
CREATE TABLE notify.preference (
    preference_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    preference_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    preference_tenant_code BIGINT NOT NULL,
    preference_organization_id BIGINT NOT NULL,
    preference_user_account_id BIGINT NOT NULL,
    preference_daily_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
    preference_daily_reminder_time TIME,
    preference_review_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    preference_mock_suggestions_enabled BOOLEAN NOT NULL DEFAULT true,
    preference_weekly_report_email_enabled BOOLEAN NOT NULL DEFAULT true,
    preference_quiet_hours_start TIME NOT NULL DEFAULT '22:00',
    preference_quiet_hours_end TIME NOT NULL DEFAULT '08:00',
    preference_ignored_streak SMALLINT NOT NULL DEFAULT 0,
    preference_reduced_frequency_until DATE,
    preference_metadata JSONB NOT NULL DEFAULT '{}',
    preference_created_by BIGINT,
    preference_updated_by BIGINT,
    preference_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    preference_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_preference_tenant FOREIGN KEY (preference_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_preference_organization FOREIGN KEY (preference_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_preference_user_account FOREIGN KEY (preference_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_preference_created_by FOREIGN KEY (preference_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_preference_updated_by FOREIGN KEY (preference_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_preference_user_account UNIQUE (preference_user_account_id)
);

CREATE INDEX idx_preference_daily_reminder_time ON notify.preference(preference_daily_reminder_time) WHERE preference_daily_reminder_enabled;
CREATE INDEX idx_preference_tenant_code ON notify.preference(preference_tenant_code);
CREATE INDEX idx_preference_organization_id ON notify.preference(preference_organization_id);
CREATE INDEX idx_preference_created_by ON notify.preference(preference_created_by);
CREATE INDEX idx_preference_updated_by ON notify.preference(preference_updated_by);

CREATE TRIGGER trg_preference_updated_at BEFORE UPDATE ON notify.preference
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('preference_updated_at');

-- -----------------------------------------------------
-- Table: notify.device
-- Purpose: Push-capable device/browser registrations.
-- -----------------------------------------------------
CREATE TABLE notify.device (
    device_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    device_tenant_code BIGINT NOT NULL,
    device_organization_id BIGINT NOT NULL,
    device_user_account_id BIGINT NOT NULL,
    device_platform VARCHAR(100) NOT NULL,
    device_token_provider VARCHAR(100) NOT NULL,
    device_push_token VARCHAR(400) NOT NULL,
    device_app_version VARCHAR(20),
    device_device_name VARCHAR(100),
    device_locale VARCHAR(10),
    device_permission_granted BOOLEAN,
    device_last_seen_at TIMESTAMP WITH TIME ZONE,
    device_disabled_at TIMESTAMP WITH TIME ZONE,
    device_disabled_reason VARCHAR(60),
    device_metadata JSONB NOT NULL DEFAULT '{}',
    device_created_by BIGINT,
    device_updated_by BIGINT,
    device_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    device_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_device_tenant FOREIGN KEY (device_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_device_organization FOREIGN KEY (device_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_device_user_account FOREIGN KEY (device_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_device_platform FOREIGN KEY (device_platform) REFERENCES enums.client_platform(client_platform_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_device_token_provider FOREIGN KEY (device_token_provider) REFERENCES enums.push_token_provider(push_token_provider_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_device_created_by FOREIGN KEY (device_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_device_updated_by FOREIGN KEY (device_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_device_push_token UNIQUE (device_push_token)
);

CREATE INDEX idx_device_tenant_code ON notify.device(device_tenant_code);
CREATE INDEX idx_device_organization_id ON notify.device(device_organization_id);
CREATE INDEX idx_device_user_account_id ON notify.device(device_user_account_id);
CREATE INDEX idx_device_platform ON notify.device(device_platform);
CREATE INDEX idx_device_token_provider ON notify.device(device_token_provider);
CREATE INDEX idx_device_created_by ON notify.device(device_created_by);
CREATE INDEX idx_device_updated_by ON notify.device(device_updated_by);

CREATE TRIGGER trg_device_updated_at BEFORE UPDATE ON notify.device
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('device_updated_at');

-- -----------------------------------------------------
-- Table: notify.notification
-- Purpose: In-app notification record and send queue.
-- -----------------------------------------------------
CREATE TABLE notify.notification (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    notification_tenant_code BIGINT NOT NULL,
    notification_organization_id BIGINT NOT NULL,
    notification_user_account_id BIGINT NOT NULL,
    notification_kind VARCHAR(100) NOT NULL,
    notification_title VARCHAR(80) NOT NULL,
    notification_body VARCHAR(200) NOT NULL,
    notification_deep_link VARCHAR(300),
    notification_payload JSONB NOT NULL DEFAULT '{}',
    notification_dedupe_key VARCHAR(150) NOT NULL,
    notification_scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    notification_read_at TIMESTAMP WITH TIME ZONE,
    notification_opened_at TIMESTAMP WITH TIME ZONE,
    notification_expires_at TIMESTAMP WITH TIME ZONE,
    notification_metadata JSONB NOT NULL DEFAULT '{}',
    notification_created_by BIGINT,
    notification_updated_by BIGINT,
    notification_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    notification_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_notification_tenant FOREIGN KEY (notification_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_notification_organization FOREIGN KEY (notification_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_user_account FOREIGN KEY (notification_user_account_id) REFERENCES identity.user_account(user_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_kind FOREIGN KEY (notification_kind) REFERENCES enums.notification_kind(notification_kind_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_notification_created_by FOREIGN KEY (notification_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_notification_updated_by FOREIGN KEY (notification_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT uq_notification_user_account_dedupe_key UNIQUE (notification_user_account_id, notification_dedupe_key)
);

CREATE INDEX idx_notification_user_account_created_at ON notify.notification(notification_user_account_id, notification_created_at DESC);
CREATE INDEX idx_notification_scheduled_for ON notify.notification(notification_scheduled_for);
CREATE INDEX idx_notification_tenant_code ON notify.notification(notification_tenant_code);
CREATE INDEX idx_notification_organization_id ON notify.notification(notification_organization_id);
CREATE INDEX idx_notification_kind ON notify.notification(notification_kind);
CREATE INDEX idx_notification_created_by ON notify.notification(notification_created_by);
CREATE INDEX idx_notification_updated_by ON notify.notification(notification_updated_by);

CREATE TRIGGER trg_notification_updated_at BEFORE UPDATE ON notify.notification
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('notification_updated_at');

-- -----------------------------------------------------
-- Table: notify.delivery
-- Purpose: Per-channel delivery attempts of a notification.
-- -----------------------------------------------------
CREATE TABLE notify.delivery (
    delivery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_code BIGINT UNIQUE NOT NULL DEFAULT nextval('global_code_seq'),
    delivery_tenant_code BIGINT NOT NULL,
    delivery_organization_id BIGINT NOT NULL,
    delivery_notification_id BIGINT NOT NULL,
    delivery_channel VARCHAR(100) NOT NULL,
    delivery_device_id BIGINT,
    delivery_status VARCHAR(100) NOT NULL DEFAULT 'queued',
    delivery_attempt_count SMALLINT NOT NULL DEFAULT 0,
    delivery_next_attempt_at TIMESTAMP WITH TIME ZONE,
    delivery_sent_at TIMESTAMP WITH TIME ZONE,
    delivery_provider_message_id VARCHAR(200),
    delivery_error_code VARCHAR(80),
    delivery_metadata JSONB NOT NULL DEFAULT '{}',
    delivery_created_by BIGINT,
    delivery_updated_by BIGINT,
    delivery_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    delivery_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT fk_delivery_tenant FOREIGN KEY (delivery_tenant_code) REFERENCES identity.tenant(tenant_code) ON DELETE RESTRICT,
    CONSTRAINT fk_delivery_organization FOREIGN KEY (delivery_organization_id) REFERENCES identity.organization(organization_id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_notification FOREIGN KEY (delivery_notification_id) REFERENCES notify.notification(notification_id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_channel FOREIGN KEY (delivery_channel) REFERENCES enums.notification_channel(notification_channel_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_delivery_device FOREIGN KEY (delivery_device_id) REFERENCES notify.device(device_id) ON DELETE SET NULL,
    CONSTRAINT fk_delivery_status FOREIGN KEY (delivery_status) REFERENCES enums.delivery_status(delivery_status_value) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_delivery_created_by FOREIGN KEY (delivery_created_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL,
    CONSTRAINT fk_delivery_updated_by FOREIGN KEY (delivery_updated_by) REFERENCES identity.user_account(user_account_id) ON DELETE SET NULL
);

CREATE INDEX idx_delivery_status_next_attempt_at ON notify.delivery(delivery_status, delivery_next_attempt_at);
CREATE INDEX idx_delivery_tenant_code ON notify.delivery(delivery_tenant_code);
CREATE INDEX idx_delivery_organization_id ON notify.delivery(delivery_organization_id);
CREATE INDEX idx_delivery_notification_id ON notify.delivery(delivery_notification_id);
CREATE INDEX idx_delivery_channel ON notify.delivery(delivery_channel);
CREATE INDEX idx_delivery_device_id ON notify.delivery(delivery_device_id);
CREATE INDEX idx_delivery_created_by ON notify.delivery(delivery_created_by);
CREATE INDEX idx_delivery_updated_by ON notify.delivery(delivery_updated_by);

CREATE TRIGGER trg_delivery_updated_at BEFORE UPDATE ON notify.delivery
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at('delivery_updated_at');



COMMIT;
