import crypto from 'node:crypto';
import { rawQuery } from './tx.js';

// storage.blob yazımı (şablon §11.3; kalıcı sağlayıcı = Postgres). `key` UNIQUE: aynı anahtar üzerine yazılır.
export const storagePut = async ({ key, contentType, data, ownerSchema, ownerCode = null, organizationId = null, expiresAt = null, tenantCode = 1 }) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const { rows } = await rawQuery(
    `INSERT INTO storage.blob (blob_tenant_code, blob_organization_id, blob_key, blob_content_type, blob_byte_size, blob_sha256, blob_data, blob_owner_schema, blob_owner_code, blob_expires_at)
     VALUES ((SELECT tenant_code FROM identity.tenant ORDER BY tenant_id LIMIT 1),$1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (blob_key) DO UPDATE SET blob_content_type=EXCLUDED.blob_content_type, blob_byte_size=EXCLUDED.blob_byte_size, blob_sha256=EXCLUDED.blob_sha256,
            blob_data=EXCLUDED.blob_data, blob_expires_at=EXCLUDED.blob_expires_at
     RETURNING blob_id AS id, blob_code AS code`,
    [organizationId, `db://${key}`, contentType, buf.length, sha, buf, ownerSchema, ownerCode, expiresAt]);
  return rows[0];
};

export const storageGet = async (key) => {
  const { rows } = await rawQuery(`SELECT blob_content_type AS "contentType", blob_data AS data FROM storage.blob WHERE blob_key=$1`, [`db://${key}`]);
  return rows[0] || null;
};
