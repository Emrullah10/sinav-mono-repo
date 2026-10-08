import { default as successResponses } from './responses/successful-response.js';
import { default as customeErrors } from './responses/custom-reponse.js';
import { default as errorResponses } from './responses/error-response.js';
import { default as messages } from './messages.js';
import { default as errorHandlers } from './handleErrors.js';

const init = {
  ...successResponses,
  ...errorResponses,
  ...customeErrors,
  ...errorHandlers,
  messages,
};

export default init;
