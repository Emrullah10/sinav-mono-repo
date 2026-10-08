/* eslint-disable no-restricted-syntax */
/* eslint-disable global-require */
import middlewareFactoryList, {
  commonMiddleware,
  authMiddleware,
} from './middleware-list-middleware.js';

export default function middlewareFactory(config) {
  return middlewareFactoryList.map((factory) => factory(config));
}

export const commonMiddlewareFactory = (config) =>
  commonMiddleware.map((factory) => factory(config));

export const authMiddlewareFactory = (config) =>
  authMiddleware.map((factory) => factory(config));
