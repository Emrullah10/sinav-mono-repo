export default {
  responseGet: { type: 'object', properties: { code: { type: 'string', example: 'success' }, message: { type: 'string', example: 'Success' }, list: { type: 'array', example: [] } } },
  responsePost: { type: 'object', properties: { code: { type: 'string', example: 'success' }, message: { type: 'string', example: 'Success' }, item: { type: 'object', example: {} } } },
  QueryParameters: {
    type: 'object',
    properties: {
      startRow: { type: 'number', example: 0 },
      endRow: { type: 'number', example: 100 },
      sortModel: { type: 'array', items: { type: 'object', properties: { colId: { type: 'string', example: 'id' }, sort: { type: 'string', example: 'asc' } } } },
      filterModel: { type: 'object', properties: { id: { type: 'object', properties: { type: { type: 'string', example: 'equals' }, filter: { type: 'string', example: '2' } } } } },
    },
  },
};
