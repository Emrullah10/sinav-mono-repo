/* eslint-disable no-underscore-dangle */
function parseGraphResult(rawResult) {
  const nodeArray = [];
  while (rawResult.hasNext()) {
    const formattedObject = {};
    const record = rawResult.next();
    for (let i = 0; i < record._header.length; i += 1) {
      formattedObject[record._header[i]] = record._values[i];
    }
    nodeArray.push(formattedObject);
  }
  return nodeArray;
}
let client;

export default function init(redisGraphClient) {
  if (!client) {
    client = redisGraphClient;
  }
  async function graphCall(...inputs) {
    const rawResult = await client.graph.query(...inputs);

    return parseGraphResult(rawResult);
  }

  return graphCall;
}
