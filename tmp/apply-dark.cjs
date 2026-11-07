const fs=require('node:fs');const p='web/index.html';
let s=fs.readFileSync(p,'utf8');
s=s.replace('<img class="brand-logo" src="./assets/brand/vitrine.svg" width="188" height="58" alt="vitrine — coletivo inspira">','<img class="brand-logo brand-logo-light" src="./assets/brand/vitrine.svg" width="188" height="58" alt="vitrine — coletivo inspira"><img class="brand-logo brand-logo-dark" src="./assets/brand/vitrine-inverse.svg" width="188" height="58" alt="vitrine — coletivo inspira">');
fs.writeFileSync(p,s);
