const fs = require('node:fs');
const acorn = require('acorn');
const entries = new Set();
function add(value) {
  const text = value.trim();
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text) && !text.includes('${')) entries.add(text);
}
function html(source) {
  for (const match of source.matchAll(/>([^<>]+)</g)) add(match[1]);
  for (const match of source.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) add(match[1]);
}
html(fs.readFileSync('index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, ''));
html(fs.readFileSync('patient.html', 'utf8'));
function visit(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    if (node.value.includes('<')) html(node.value);
    else if (/[áéíóúñ¿¡]|\s/.test(node.value) && !/[#{}\n\\]/.test(node.value)) add(node.value);
  }
  if (node.type === 'TemplateLiteral') {
    const template = node.quasis.map(q => q.value.cooked).join('___');
    if (template.includes('<')) html(template);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.filter(x => x?.type).forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(acorn.parse(fs.readFileSync('app.js','utf8'), { ecmaVersion:'latest' }));
const catalog = require('../i18n-catalog');
console.log([...entries].sort().filter(value => !process.argv.includes('--missing') || !catalog[value]).join('\n'));
