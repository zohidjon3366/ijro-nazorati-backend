'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let errors = 0;
function check(condition, message) { if (!condition) { console.error(`FAIL: ${message}`); errors += 1; } }

const pages = ['index.html','xizmatlar.html','narxlar.html','team.html','foydali.html','yangiliklar.html','foydali-calendar.html','foydali-workdays.html','foydali-rent.html','foydali-laws.html','foydali-links.html'];
for (const prefix of ['', 'ru', 'en', 'zh']) {
  for (const file of pages) {
    const target = path.join(ROOT, prefix, file);
    check(fs.existsSync(target), `${prefix ? `${prefix}/` : ''}${file} missing`);
    if (fs.existsSync(target)) {
      const html = fs.readFileSync(target, 'utf8');
      check(html.includes('independence-35.css?v=30.1'), `${file} design layer missing`);
      check(html.includes('app.js?v=30.1'), `${file} client layer missing`);
      check(html.includes('site-header') && html.includes('site-footer'), `${file} shared layout missing`);
      check(html.includes('/assets/img/logo-original.png'), `${file} original logo missing`);
      check(html.includes('family=Inter'), `${file} original Inter font missing`);
    }
  }
}

for (const file of ['server.js','assets/js/app.js','assets/js/admin.js','scripts/generate-pages.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  try { new vm.Script(source, { filename: file }); } catch (error) { check(false, `${file} syntax: ${error.message}`); }
}

for (const file of ['data/team.json','data/useful-admin-data.json']) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')); } catch (error) { check(false, `${file} JSON: ${error.message}`); }
}

const hero = path.join(ROOT,'assets/img/uzbekistan-independence-35-hero.png');
check(fs.existsSync(hero) && fs.statSync(hero).size > 100000, 'hero composition missing or too small');
check(fs.existsSync(path.join(ROOT,'assets/img/logo-original.png')), 'original header logo missing');
check(fs.existsSync(path.join(ROOT,'assets/img/logo-original-white.png')), 'original footer logo missing');
check(fs.existsSync(path.join(ROOT,'admin/jamoa.html')), 'team admin missing');
check(fs.existsSync(path.join(ROOT,'admin/foydali.html')), 'useful admin missing');
check(fs.readFileSync(path.join(ROOT,'server.js'),'utf8').includes('/health'), 'health endpoint missing');

if (errors) { console.error(`Build verification failed: ${errors} problem(s).`); process.exit(1); }
console.log('ALL FINANCE v30 build verification: OK');
console.log('44 public pages, 4 languages, admin/API, JSON data and anniversary assets verified.');
