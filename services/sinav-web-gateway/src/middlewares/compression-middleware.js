import compression from 'compression';

// SSE (text/event-stream) sıkıştırılmaz: akış parça parça gelmeli.
export default function compressionFactory() {
  return compression({
    filter: (req, res) => {
      const type = String(res.getHeader('Content-Type') || '');
      if (type.includes('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  });
}
