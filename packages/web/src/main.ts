import { mountApp } from './app.js';

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app element');
mountApp(root);