// Geri bildirim medyası (tarayıcı): görseli küçült, ekran karesi yakala, kayıt biçimi seç, base64'e çevir.
export const MAX_RECORD_MS = 120 * 1000;

export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;base64,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const loadBitmap = async (blob) => {
  if (window.createImageBitmap) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Uzun kenarı en çok `max` px olan JPEG: { data(base64), preview(objectURL) }. Okunamayan dosyada hata fırlatır. */
export const compressImage = async (blob, { max = 1600, quality = 0.78 } = {}) => {
  const bmp = await loadBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!out) throw new Error('encode failed');
  return { data: await blobToBase64(out), preview: URL.createObjectURL(out) };
};

export const canCaptureScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** Tarayıcıdan tek bir ekran karesi (paylaşım izni sorulur; mümkünse bu sekme önerilir). */
export const captureScreenFrame = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Paylaşım penceresi kapanırken ilk kare boş gelebilir: kısa bekle.
    await new Promise((r) => setTimeout(r, 250));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
  }
};

export const recorderMime = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
};

export const formatDuration = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
