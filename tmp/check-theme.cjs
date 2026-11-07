const {chromium}=require('C:/Users/atene.adm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true});fs.mkdirSync('.impeccable/review/theme',{recursive:true});
for(const width of [1440,390]){
const p=await b.newPage({viewport:{width,height:1000},colorScheme:'dark',reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
for(const mode of ['dark','light']){
await p.screenshot({path:`.impeccable/review/theme/${width}-${mode}.png`,fullPage:true});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
assert.equal(await p.locator('.site-header .brand-logo-'+mode).isVisible(),true);
assert.equal(await p.locator('.site-footer .brand-logo-'+mode).isVisible(),true);
assert.equal(await p.locator('.theme-toggle').isVisible(),true);
if(mode==='dark')await p.getByRole('button',{name:'Ativar modo claro'}).click();
}
await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
await p.getByRole('button',{name:'Ativar modo escuro'}).focus();await p.keyboard.press('Enter');assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
if(width===390){await p.locator('.menu-toggle').click();assert.equal(await p.locator('#site-nav').isVisible(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('#site-nav').isVisible(),false);}
assert.deepEqual(errors,[]);console.log(width,'system dark, both themes, saved preference, keyboard, logos and overflow: pass');await p.close();}
const p=await b.newPage({colorScheme:'light'});await p.goto('http://127.0.0.1:4173/');await p.emulateMedia({colorScheme:'dark'});assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');console.log('system preference change: pass');await p.close();
const q=await b.newPage();await q.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})});await q.goto('http://127.0.0.1:4173/');await q.locator('.theme-toggle').click();assert.equal(await q.locator('html').getAttribute('data-theme'),'dark');console.log('blocked storage fallback: pass');await b.close();})().catch(e=>{console.error(e);process.exit(1)});
