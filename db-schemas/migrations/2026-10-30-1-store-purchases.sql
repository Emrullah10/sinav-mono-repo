-- Mağaza satın almaları (RevenueCat): enums.payment_provider 'revenuecat' + billing.store_product.
--
-- NEDEN: Mobil uygulamada Apple/Google uygulama içi satın alma zorunlu. RevenueCat webhook'u billing servisine
-- gelir; mağaza ürün kimliği (RC product_id) → bizim ürün eşlemesi bu tabloda tutulur.
-- Olay tekrarları mevcut billing.provider_event (provider='revenuecat') ile elenir; mağazanın asıl işlem kimliği
-- subscription_provider_ref ve entitlement_grant_source_ref alanlarına yazılır (yeni işlem tablosu yok).
-- Önce salt okunur kontrol (boş dönmeli): SELECT to_regclass('billing.store_product');
-- ÇALIŞTIRMA: node scripts/apply-migrations.mjs 2026-10-30-1-store-purchases.sql
BEGIN;

INSERT INTO enums.payment_provider (payment_provider_value, payment_provider_label, payment_provider_sort_order) VALUES
    ('revenuecat', 'RevenueCat', 3);

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

COMMIT;
