import crypto from 'node:crypto';
import { rawQuery as defaultRawQuery } from '../persistence/tx.js';

// `db://` şemasının sağlayıcısı — byte'lar `storage.blob` tablosunda BYTEA.
//
// ── NEDEN AYRI TABLO ────────────────────────────────────────────────────
// RFQ/bid emsali BYTEA'yı doğrudan entity tablosuna koydu
// (`rfq_document_file_data`) ve bedelini ödüyor: bid-pricing.use-case.js
// alanı liste sonucundan tek tek ayıklamak zorunda.
//
// Doküman servisinde bu ÇOK daha kötü olurdu, çünkü sıcak yollar `SELECT *`
// kullanıyor: shared/helpers.js:70 (her indirme/arşiv/silme/versiyon),
// list-documents (LIMIT 200'e kadar), download-document (document_version).
// Tek bir depo sayfası 200 dosyanın byte'ını çekerdi. Ayrı tablo bu tuzağı
// tamamen ortadan kaldırır; ana tabloların heap'i küçük ve cache'te kalır.
//
// ── NEDEN `storage` ŞEMASI ──────────────────────────────────────────────
// Portun 9 çağrı yeri var, 6 serviste: doküman, KYC belgesi, firma logosu,
// kullanıcı avatarı, fatura PDF'i, iptal/itiraz kanıtı, destek eki. Tabloyu
// `document` şemasına koymak billing ve identity'nin oraya yazması demekti —
// yanlış sahiplik sinyali.

const SELECT_COLUMNS = `blob_content_type, blob_size, blob_data, blob_checksum`;

const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

// Çalıştırıcı: ya pg-pool tarzı `rawQuery(sql, params)` fonksiyonu ya da açık
// bir transaction istemcisi `conn.query(sql, params)`. raw.js ile aynı desen.
const runner = (conn) =>
  typeof conn === 'function'
    ? (sql, params) => conn(sql, params)
    : (sql, params) => conn.query(sql, params);

export const createPostgresStorageProvider = ({
  query = defaultRawQuery,
} = {}) => ({
  // Kalıcıdır — açılış muhafızı (assertDurableStorage) bu bayrağa bakar.
  durable: true,

  // `conn` verilirse INSERT çağıranın transaction'ına katılır.
  //
  // ⚠️ Bu, bugünkü YETİM BLOB hatasını kökten çözer: storeUploadFile
  // `withTransaction`dan ÖNCE çalıştığı için başarısız her yükleme kalıcı bir
  // blob bırakıyordu. Aynı tx içinde yazınca rollback byte'ları da geri alır.
  upload: async ({ key, contentType, buffer, conn = null, metadata = null }) => {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Postgres storage provider requires a Buffer');
    }
    const run = runner(conn || query);
    await run(
      `INSERT INTO storage.blob (
         blob_key, blob_tenant_code, blob_organization_id,
         blob_content_type, blob_size, blob_checksum, blob_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        key,
        metadata?.tenantCode ?? null,
        metadata?.organizationId ?? null,
        contentType || 'application/octet-stream',
        buffer.length,
        sha256(buffer),
        buffer,
      ],
    );
    return { size: buffer.length };
  },

  // Bulunamazsa `null` — port sözleşmesi gereği FIRLATMAZ (bkz. storage.js,
  // hesapsız paylaşım ucunun jenerik-404 sözleşmesi).
  download: async (key) => {
    const { rows } = await query(
      `SELECT ${SELECT_COLUMNS} FROM storage.blob WHERE blob_key = $1 LIMIT 1`,
      [key],
    );
    const row = rows?.[0];
    if (!row?.blob_data) return null;
    return {
      buffer: row.blob_data,
      contentType: row.blob_content_type,
      size: Number(row.blob_size),
      checksum: row.blob_checksum,
    };
  },

  // Acilis on-kontrolu: tablo GERCEKTEN erisilebilir mi?
  // `LIMIT 0` satir okumaz; amac tablonun varligini VE sinav_svc'nin
  // yetkisini dogrulamak. Iki klasik dagitim hatasini birden yakalar:
  // migration 1'in hic kosmamasi (42P01) ve grant migration'inin (2)
  // atlanmasi (42501 permission denied).
  probe: async () => {
    await query(`SELECT 1 FROM storage.blob LIMIT 0`);
    return true;
  },

  remove: async (key) => {
    const { rowCount } = await query(
      `DELETE FROM storage.blob WHERE blob_key = $1`,
      [key],
    );
    return (rowCount ?? 0) > 0;
  },
});

export default createPostgresStorageProvider;
