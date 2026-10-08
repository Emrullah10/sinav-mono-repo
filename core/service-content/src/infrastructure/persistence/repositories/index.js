import domain from '../../../domain/index.js';

const repositoryImpls = {};
for (const [name, entry] of Object.entries(domain)) repositoryImpls[name] = entry.repositoryImpl;

export default repositoryImpls;
