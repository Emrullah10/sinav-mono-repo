/* eslint-disable no-prototype-builtins */
import appConfig from '../../../modules/config/index.js';

import OpenApiValidator from 'express-openapi-validator';

export const addValidator = async (app, serviceVersions, createOpenApiDoc) => {
  const originalDocPath = {};
  const validateRequests = !!appConfig.validateRequests;
  const validateResponses = !!appConfig.validateResponses;

  // eslint-disable-next-line consistent-return
  function mergeOpenApiDocs() {
    try {
      const mergedDocument = {};
      const versions = serviceVersions(appConfig.apiDocsPath);
      for (let index = 0; index < versions.length; index += 1) {
        const element = versions[index];
        const swaggerDocument = createOpenApiDoc(element.path);
        if (index === 0) {
          Object.assign(mergedDocument, swaggerDocument);
          mergedDocument.paths = {};
        }
        for (const key in swaggerDocument.paths) {
          if (swaggerDocument.paths.hasOwnProperty(key)) {
            const method = swaggerDocument.paths[key];
            for (const mthd in method) {
              if (method.hasOwnProperty(mthd)) {
                if (!originalDocPath[key]) {
                  originalDocPath[key] = {};
                }
                originalDocPath[key][mthd.toLowerCase()] = true;
              }
            }
            const versionedPath = `/${element.version}${key}`;
            if (!mergedDocument.paths[versionedPath]) {
              mergedDocument.paths[versionedPath] = {};
            }
            Object.assign(mergedDocument.paths[versionedPath], method);
          }
        }
      }
      return mergedDocument;
    } catch (error) {
      console.log(error);
    }
  }
  const mergedDocuments = mergeOpenApiDocs();
  if (!mergedDocuments) {
    return;
  }
  let basePath = '';
  mergedDocuments.info['x-serviceDiscovery'].forEach((data) => {
    if (data.basePath) basePath += data.basePath;
    if (data.basePathPrefix) {
      basePath = data.basePathPrefix + basePath;
    }
  });

  if (validateRequests || validateResponses) {
    app.use((req, res, next) => {
      try {
        const [originalUrl] = req.url.replace(basePath, '').split('?');

        const versionedUrl = originalUrl;
        if (versionedUrl) {
          req.tempOriginalUrl = req.url;
          req.url = basePath + versionedUrl;
          req.originalUrl = req.url;
        }
      } catch (error) {
        console.log(error);
      }
      next();
    });
  }

  if (validateRequests || validateResponses) {
    app.use(
      OpenApiValidator.middleware({
        apiSpec: mergedDocuments,
        validateRequests,
        validateResponses, // false by default
      }),
    );
    app.use((req, res, next) => {
      try {
        if (req.tempOriginalUrl) {
          req.url = req.tempOriginalUrl;
          req.originalUrl = req.url;
          delete req.tempOriginalUrl;
        }
      } catch (error) {
        console.log(error);
      }
      next();
    });
  }
};
