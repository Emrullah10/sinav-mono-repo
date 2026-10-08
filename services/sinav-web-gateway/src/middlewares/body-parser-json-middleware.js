import bodyParser from 'body-parser';
import appConfig from 'app-config';

export default function bodyParserJsonFactory() {
  return bodyParser.json(appConfig.remoting.json);
}
