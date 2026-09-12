const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const catalog = require('../i18n-catalog');
const storage = new Map();
const body = {};
const context = vm.createContext({ CLINIC_TRANSLATIONS:catalog,
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  location:{pathname:'/index.html'},
  document:{body,documentElement:{},createTreeWalker:()=>({nextNode:()=>false}),querySelectorAll:()=>[],addEventListener(){}},
  NodeFilter:{SHOW_TEXT:4},CustomEvent:class {},dispatchEvent(){}
});
context.window=context;
vm.runInContext(fs.readFileSync('i18n.js','utf8'),context);
assert.equal(context.ClinicI18n.language,'en');
assert.equal(context.T('Ingresar'),'Sign in');
assert.equal(context.S(['Pagina ',' de ',''],1,3),'Page 1 of 3');
assert.equal(context.S(['',' paciente(s) con deuda'],2),'Patients with outstanding balances: 2');
assert.equal(context.H(['<p>Paciente</p><strong>','</strong>'],'Consulta'),'<p data-system-copy="Paciente">Patient</p><strong>Consulta</strong>', 'Patient text must not be translated');
assert.equal(context.H('<option>Presencial</option>'),'<option value="Presencial" data-system-copy="Presencial">In person</option>', 'Stored option values must remain unchanged');
assert.equal(context.H(['<p>Esperado ',' · Contado ','</p>'],5,6),'<p>Expected 5 · Counted 6</p>');
assert.equal(context.H(['<span>','</span>'],'<b>already rendered</b>'),'<span><b>already rendered</b></span>');
assert.equal(context.T('Unknown user note'),'Unknown user note');
const labels=context.ClinicI18n.labels({admin:'Administrador'});
assert.equal(labels.admin,'Administrator');
context.ClinicI18n.setLanguage('es');
assert.equal(context.T('Ingresar'),'Ingresar');
assert.equal(labels.admin,'Administrador','Labels must respond to language changes');
assert.equal(storage.get('clinicLanguage'),'es');
assert.equal(context.S(['Pagina ',' de ',''],1,3),'Pagina 1 de 3');
assert.equal(context.document.documentElement.lang,'es');
const source=fs.readFileSync('app.js','utf8');
assert.doesNotMatch(source,/(===|!==) T\(/,'Localization must not change identity comparisons');
assert.doesNotMatch(source,/toLocale(?:DateString|TimeString|String)\("es-US"/);
assert.ok(Object.keys(catalog).length>900);
console.log(`Localization checks passed: ${Object.keys(catalog).length} editorial strings, default language, switching, grammar, and unchanged patient values.`);
