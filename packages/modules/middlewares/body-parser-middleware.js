import appConfig from 'app-config';
import bodyParser from 'body-parser';
import xml2js from 'xml2js';

let xmlParser = (req, res, next) => {
  if (req.is('application/xml')) {
    let rawData = '';
    req.on('data', (chunk) => {
      rawData += chunk;
    });
    req.on('end', () => {
      xml2js.parseString(rawData, { explicitArray: false }, (err, result) => {
        if (err) {
          return res.status(400).send('Invalid XML format');
        }
        req.body = result; // Attach parsed XML to req.body
        next();
      });
    });
  } else {
    next(); // Not XML, continue
  }
};
export default function bodyParserFactory() {
  return [
    bodyParser.json(appConfig.remoting.json),
    bodyParser.text({ type: 'text/plain' }),
    xmlParser,
    bodyParser.urlencoded(appConfig.remoting.urlencoded),
  ];
}
