import bodyParser from 'body-parser';
import appConfig from 'app-config';

export default function bodyParserUrlEncodeFactory() {
  return bodyParser.urlencoded(appConfig.remoting.urlencoded);
}
