import domain from '../../domain/index.js';

const useCases = {};
for (const [name, entry] of Object.entries(domain)) useCases[name] = entry.useCase;

export default useCases;
