import domain from '../../domain/index.js';

const controllers = {};
for (const [name, entry] of Object.entries(domain)) controllers[name] = entry.controller;

export default controllers;
