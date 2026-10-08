import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import appConfig from 'app-config';

const JWT_ISSUER = 'sinav-gateway';

// appConfig, main.js içinde createAppConfig() çalıştıktan sonra dolar; bu yüzden
// süreyi modül yükleme anında sabitlemeyip her çağrıda lazy okuyoruz (saniye).
const accessTtlSeconds = () => appConfig.accessTokenExpiry;

// Anahtar yolları env'den; göreli yol REPO KÖKÜNE göre çözülür. Dosya yoksa açılış düşer.
const keyPath = (envName) => {
  const v = process.env[envName];
  if (!v) throw new Error(`${envName} env required`);
  return path.isAbsolute(v) ? v : path.resolve(process.cwd(), '..', '..', v);
};
const privateKey = fs.readFileSync(keyPath('JWT_PRIVATE_KEY_PATH'));
const publicKey = fs.readFileSync(keyPath('JWT_PUBLIC_KEY_PATH'));

const verifyOptions = {
  algorithms: ['RS256'],
  issuer: JWT_ISSUER,
  clockTolerance: 5,
};

const signAccess = (claims) => {
  const jti = crypto.randomBytes(16).toString('hex');
  const payload = { ...claims, jti };
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    issuer: JWT_ISSUER,
    expiresIn: accessTtlSeconds(),
  });
  const decoded = jwt.decode(token);
  return { token, jti, exp: decoded.exp };
};

const verifyAccess = (token) => jwt.verify(token, publicKey, verifyOptions);

export { signAccess, verifyAccess, accessTtlSeconds, JWT_ISSUER };
