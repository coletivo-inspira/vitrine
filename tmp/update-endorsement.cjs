const fs=require('node:fs');
const path='.impeccable/design.json'; const d=JSON.parse(fs.readFileSync(path,'utf8'));
d.extensions.vitrineBrand.endorsement={text:'coletivo inspira',position:'below wordmark, right aligned',color:'#133824',outlined:true};
fs.writeFileSync(path,JSON.stringify(d,null,2)+'\n');
const html='web/index.html';fs.writeFileSync(html,fs.readFileSync(html,'utf8').replaceAll('alt="vitrine"','alt="vitrine — coletivo inspira"'));
