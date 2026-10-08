import crypto from 'node:crypto';

// ŞEMA-YÖNLENDİRMELİ (scheme-routed) depolama portu.
//
// ── NEDEN BÖYLE ─────────────────────────────────────────────────────────
// Depolama URL'i her zaman `<scheme>://<key>` biçimindedir ve ŞEMA bir
// SÜSLEME DEĞİL, YÖNLENDİRME ANAHTARIDIR. Her şema kendi sağlayıcısına kayıtlıdır:
//
//     registerStorageProvider('db',  postgresProvider);
//     registerStorageProvider('gcs', gcsProvider);      // ileride
//     setWriteScheme('db');                             // YENİ yüklemeler nereye
//
// Bunun kazandırdığı şey GEÇİŞTİR: bir sağlayıcıdan diğerine taşınırken
// satırlar KARIŞIK olur — bir kısmı `db://`, bir kısmı `gcs://`. Şema
// yönlendirmesi ikisini de AYNI ANDA okunabilir tutar. Yani büyük-patlama
// cutover yok, geçiş öncesi toplu satır yeniden yazma yok, ve her adım geri
// alınabilir (`setWriteScheme` yazmayı çevirir, kopyalanmış satırlar okunur
// kalır).
//
// ⚠️ Bu yüzden `downloadFile` TAM URL alır, çıplak anahtar değil. Şemayı
// çağıran tarafta kesmek (eski `storageKeyFromUrl(url)` deseni) yönlendirmeyi
// imkânsız kılar ve geçişi tek-sağlayıcıya hapseder.
//
// ── PORT SAF KALIR ──────────────────────────────────────────────────────
// Burası process.env OKUMAZ ve hiçbir sürücüye bağlanmaz (mail.js ile aynı
// ilke). Gerçek sağlayıcılar kompozisyon kökünden — her servisin boot.js'i —
// `installStorageProviderFromEnv` ile kurulur.

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Node tek is parcacigidir ve 25MB'lik tek seferlik bir sha256 olay dongusunu
// ~40-60 ms BLOKLAR. 100 belgelik bir ZIP'te bu saniyelere cikar ve o sure
// boyunca servis BASKA HICBIR ISTEGE cevap veremez.
//
// Bu yuzden buyuk buffer'lar parca parca hash'lenir ve parcalar arasinda olay
// dongusune donulur. Kucuk dosyalar (<= CHUNK) tek turda biter — yani yaygin
// durumda ekstra maliyet yok.
const HASH_CHUNK_BYTES = 1024 * 1024;

const sha256Async = async (buffer) => {
  if (buffer.length <= HASH_CHUNK_BYTES) return sha256(buffer);
  const hash = crypto.createHash('sha256');
  for (let offset = 0; offset < buffer.length; offset += HASH_CHUNK_BYTES) {
    hash.update(buffer.subarray(offset, offset + HASH_CHUNK_BYTES));
    // Bir sonraki parcadan once bekleyen G/C ve isteklerin islenmesine izin ver.
    await new Promise((resolve) => setImmediate(resolve));
  }
  return hash.digest('hex');
};

export const MEMORY_SCHEME = 'memory';

// URL'de şema ile anahtarı ayıran sabit. Anahtarın kendisi '://' İÇEREMEZ
// (sanitizeStorageKey bunu garanti eder), bu yüzden ilk eşleşme doğru olandır.
const SEPARATOR = '://';

// ── Anahtar temizliği ───────────────────────────────────────────────────
// Anahtar bir GCS/S3 nesne yolu hâline gelir. `file.originalname` doğrulanmamış
// kullanıcı girdisidir; bugün yalnız bir Map anahtarı olduğu için zararsız ama
// nesne deposunda yol ayrıştırmasına girer. Bu yüzden temizlik ŞİMDİ, tek
// yerde yapılır — geçişten sonra düzeltmek, temizlenmemiş anahtarlarla yazılmış
// satırları geri dönüşü zor hâle getirirdi.
//
// ⚠️ Bu fonksiyon GÖRÜNEN DOSYA ADINI üretmez. Türkçe karakterler ve boşluklar
// burada kaybolur; kullanıcıya gösterilen ad metadata kolonunda ayrıca saklanır
// (document_file_name, message_attachment_file_name, ...). Anahtar bir kimliktir,
// bir etiket değil.
const MAX_FILENAME_LENGTH = 120;

export const sanitizeFilename = (value) => {
  // Hem POSIX hem Windows ayırıcısını at: '../../etc/passwd' ve 'C:\x\y' →
  // yalnız son bileşen kalır, yani yol geçişi (path traversal) mümkün değil.
  const base = String(value ?? '').trim().split(/[\\/]/).pop() || '';
  const cleaned = base
    .normalize('NFKD')
    // Aksan/birleşen işaretlerini düşür (ş → s, ğ → g). Kaybı bilinçlidir.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9.\-_ ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    // Baştaki nokta gizli dosya, baştaki tire bazı CLI'larda bayrak olur.
    .replace(/^[.\-_]+/, '')
    // Sondaki alt çizgi yalnız gürültüdür (girdideki boşluktan doğar).
    .replace(/_+$/, '')
    .slice(0, MAX_FILENAME_LENGTH);
  return cleaned || 'file';
};

export const sanitizeNamespace = (value) => {
  const parts = String(value ?? '')
    .split('/')
    .map((part) => sanitizeFilename(part))
    .filter((part) => part && part !== 'file');
  return parts.length ? parts.join('/') : 'misc';
};

// Anahtar: `<namespace>/<uuid>-<filename>`. UUID çakışmayı ve tahmin
// edilebilirliği aynı anda çözer — aynı adı iki kez yüklemek birbirini EZMEZ.
export const buildStorageKey = ({ namespace, filename }) =>
  `${sanitizeNamespace(namespace)}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;

export const buildStorageUrl = (scheme, key) => `${scheme}${SEPARATOR}${key}`;

// parseStorageUrl — `{ scheme, key }`. Şemasız değer ESKİ biçimdir (port
// şema-yönlendirmeli olmadan önce çıplak anahtar dönüyordu); `scheme: null`
// ile işaretlenir ve çağıran yazma sağlayıcısına düşer.
export const parseStorageUrl = (url) => {
  const text = String(url ?? '').trim();
  if (!text) return { scheme: null, key: '' };
  const index = text.indexOf(SEPARATOR);
  if (index < 0) return { scheme: null, key: text };
  return {
    scheme: text.slice(0, index).toLowerCase(),
    key: text.slice(index + SEPARATOR.length),
  };
};

// ── Bellek içi sağlayıcı (yalnız dev + test) ────────────────────────────
// KALICI DEĞİLDİR ve üretimde kullanılmamalıdır; `assertDurableStorage`
// üretimde bunu açılışta reddeder.
const memoryStore = new Map();

const memoryProvider = {
  durable: false,
  upload: async ({ key, contentType, buffer }) => {
    memoryStore.set(key, {
      contentType,
      size: buffer?.length || 0,
      buffer,
      // Bellek saglayicisi da checksum TUTAR: aksi hâlde butunluk dogrulamasi
      // dev/test'te HIC calismaz ve yalniz uretimde devreye giren, dolayisiyla
      // hic denenmemis bir kod yolu olurdu.
      checksum: buffer ? sha256(buffer) : null,
      uploadedAt: new Date().toISOString(),
    });
    return { size: buffer?.length || 0 };
  },
  download: async (key) => memoryStore.get(key) || null,
  remove: async (key) => memoryStore.delete(key),
  flush: () => memoryStore.clear(),
  keys: () => Array.from(memoryStore.keys()),
};

// ── Sağlayıcı kayıt defteri ─────────────────────────────────────────────
const providers = new Map([[MEMORY_SCHEME, memoryProvider]]);
let writeScheme = MEMORY_SCHEME;

export const registerStorageProvider = (scheme, impl) => {
  const name = String(scheme ?? '').trim().toLowerCase();
  if (!name) throw new Error('registerStorageProvider requires a scheme');
  if (!impl?.upload || !impl?.download) {
    throw new Error(`Storage provider "${name}" must implement upload + download`);
  }
  providers.set(name, impl);
  return impl;
};

// setWriteScheme — YENİ yüklemelerin nereye gideceği. Okuma buna BAKMAZ;
// okuma her zaman satırdaki URL'in şemasını izler. Geçişi kesintisiz yapan
// ayrım tam olarak budur.
export const setWriteScheme = (scheme) => {
  const name = String(scheme ?? '').trim().toLowerCase();
  if (!providers.has(name)) {
    throw new Error(
      `Cannot set write scheme "${name}": no provider registered. ` +
        `Registered: ${[...providers.keys()].join(', ') || '(none)'}`,
    );
  }
  writeScheme = name;
  return name;
};

export const getWriteScheme = () => writeScheme;
export const getStorageProvider = (scheme) =>
  providers.get(String(scheme ?? '').trim().toLowerCase()) || null;
export const isDurableStorage = () =>
  Boolean(providers.get(writeScheme)?.durable);

// Testler için: kayıt defterini fabrika ayarına döndürür.
export const resetStorageProviders = () => {
  providers.clear();
  providers.set(MEMORY_SCHEME, memoryProvider);
  writeScheme = MEMORY_SCHEME;
  memoryProvider.flush();
};

// Geriye dönük uyumluluk: eski tek-sağlayıcılı API. Verilen implementasyonu
// bellek şemasının yerine koyar. YENİ KOD KULLANMAMALI —
// registerStorageProvider + setWriteScheme tercih edilir.
export const setStorageProvider = (impl) => {
  if (!impl) {
    resetStorageProviders();
    return;
  }
  registerStorageProvider(MEMORY_SCHEME, impl);
  setWriteScheme(MEMORY_SCHEME);
};
export const resetStorageProvider = resetStorageProviders;

// ── Genel API ───────────────────────────────────────────────────────────

// uploadFile — yazma sağlayıcısına yazar ve `{ key, url, size }` döner.
// `url` metadata kolonuna yazılacak KANONİK referanstır.
//
// ⚠️ Kolona ASLA imzalı (signed / presigned) URL yazılmaz: o süreli bir
// jetondur, kalıcı bir kolonda sessizce çürür. İmzalama istek anında yapılır.
//
// `conn` OPSİYONELDİR: verildiğinde ve sağlayıcı destekliyorsa (Postgres)
// blob yazımı çağıranın transaction'ına katılır — böylece başarısız bir
// yükleme yetim blob bırakmaz. Nesne depoları (GCS/S3) bir DB transaction'ına
// katılamaz; orada yetim nesneleri süpüren bir job gerekir.
export const uploadFile = async ({
  namespace,
  filename,
  contentType,
  buffer,
  conn = null,
  metadata = null,
} = {}) => {
  const provider = providers.get(writeScheme);
  if (!provider) {
    throw new Error(`No storage provider registered for write scheme "${writeScheme}"`);
  }
  const key = buildStorageKey({ namespace, filename });
  const result = await provider.upload({
    key,
    contentType,
    buffer,
    conn,
    metadata,
  });
  return {
    key,
    url: buildStorageUrl(writeScheme, key),
    size: result?.size ?? buffer?.length ?? 0,
  };
};

// downloadFile — TAM URL alır, şemayı çözer, o şemanın sağlayıcısına gider.
// `{ buffer, contentType, size }` ya da bulunamazsa `null` döner.
//
// ⚠️ ASLA FIRLATMAZ. Çağıranların tamamı `if (!stored?.buffer)` deseniyle
// kendi hatasını üretiyor ve bunlardan biri hesapsız paylaşım ucudur
// (public-share-download.use-case.js) — orada HER başarısızlık dalı TEK ve
// AYNI jenerik 404 olmak zorundadır, aksi hâli token uzayı keşif yan-kanalıdır.
// Buradan farklı bir istisna sızarsa o sözleşme kırılır.
//
// Çözülemeyen şema sessizce `null` dönmez: operatörün görmesi için uyarı
// basılır. Sessiz `null` tam olarak düzeltmeye çalıştığımız hata sınıfıdır.
export const downloadFile = async (storageUrl, { logger = console } = {}) => {
  const { scheme, key } = parseStorageUrl(storageUrl);
  if (!key) return null;

  // Şemasız eski değer → yazma sağlayıcısı (port şema-yönlendirmeli olmadan
  // önceki çıplak-anahtar biçimi).
  const target = scheme || writeScheme;
  const provider = providers.get(target);
  if (!provider) {
    logger.warn?.(
      `[storage] "${target}" semasi icin kayitli saglayici YOK — dosya ` +
        'cozulemedi. Bu bir YAPILANDIRMA hatasidir, eksik dosya degil. ' +
        `Kayitli semalar: ${[...providers.keys()].join(', ') || '(yok)'}`,
    );
    return null;
  }
  // ⚠️ Saglayici cagrisi SARMALANMAK ZORUNDA. Bu fonksiyonun "ASLA FIRLATMAZ"
  // sozlesmesi yalnizca port'ta yaziliydi; saglayicilar onu kendiliginden
  // saglamiyordu. Postgres adaptorunun `download`u ham `query` cagirir ve
  // ornegin migration 1 kosulup grant migration'i (2) unutulduysa
  // `permission denied for table blob` firlatirdi. Sonuc:
  //   • toplu ZIP tek bir girdide TAMAMEN duserdi (oysa sozlesme "atla"dir),
  //   • hesapsiz paylasim ucunun tek-tip 404'u 500'e donerdi (yan-kanal).
  // Hata yutulmaz, GORUNUR kilinir: uyari basilir, cagirana null doner.
  let result;
  try {
    result = await provider.download(key);
  } catch (error) {
    logger.warn?.(
      `[storage] "${target}" saglayicisi okuma sirasinda HATA verdi — ` +
        `dosya cozulemedi (eksik dosya DEGIL, altyapi hatasi): ${error.message}`,
    );
    return null;
  }
  if (!result?.buffer) return result ?? null;

  // ── Butunluk dogrulamasi ────────────────────────────────────────────
  // sha256 her yuklemede ZATEN hesaplaniyordu ama hicbir yerde
  // DOGRULANMIYORDU. Saglayici bir checksum kaydettiyse, dondugumuz byte'lari
  // ona karsi kontrol ederiz.
  //
  // Ne yakalar: bozulma/kirpilma, ve daha onemlisi YANLIS BLOB'un donmesi
  // (anahtar esleme hatasi) — bir konsimento yerine baskasinin belgesini
  // sunmak, hic sunmamaktan daha kotudur.
  //
  // ⚠️ KARARI PORT VERMEZ. `checksumOk` doner, ne yapilacagini CAGIRAN secer:
  // kimlikli indirme 500 atar, toplu ZIP dosyayi atlar, hesapsiz paylasim ise
  // TEK jenerik 404 uretmek zorundadir. Port'un burada firlatmasi o sozlesmeyi
  // kirardi.
  //
  // `checksumOk: null` = DOGRULANAMADI (saglayici checksum tutmuyor) —
  // `false` ile karistirilmamalidir.
  if (!result.checksum) return { ...result, checksumOk: null };
  const actual = await sha256Async(result.buffer);
  return { ...result, checksumOk: actual === result.checksum, actualChecksum: actual };
};

// removeFile — kalıcı silme. Yumuşak silme (status='deleted') byte'ları
// bırakır; KVKK/GDPR silme talebi gerçek silme ister. Sağlayıcı desteklemiyorsa
// `false` döner.
export const removeFile = async (storageUrl) => {
  const { scheme, key } = parseStorageUrl(storageUrl);
  if (!key) return false;
  const provider = providers.get(scheme || writeScheme);
  if (!provider?.remove) return false;
  return provider.remove(key);
};

// Test yardımcıları — bellek sağlayıcısının içine bakmak için.
export const memoryStorageKeys = () => memoryProvider.keys();
export const flushMemoryStorage = () => memoryProvider.flush();
