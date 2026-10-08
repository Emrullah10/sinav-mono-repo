import appConfig from 'app-config';
import bodyParser from 'body-parser';

export default function bodyParserFactory() {
  return [
    bodyParser.json(appConfig.remoting.json),
    bodyParser.text({ type: 'text/plain' }),
    bodyParser.urlencoded(appConfig.remoting.urlencoded),
  ];
}
