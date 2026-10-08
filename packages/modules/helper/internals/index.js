export const internalHeader = (headers) => {
  const newHeader = {};
  if (headers.user) newHeader.user = headers.user;

  return newHeader;
};
