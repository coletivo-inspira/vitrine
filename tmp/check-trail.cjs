const {chromium}=require('C:/Users/atene.adm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const b=await chromium.launch({headless:true});fs.mkdirSync('.impeccable/review/trail',{recursive:true});
const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
const pixels=()=>p.locator('.dot-trail').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i])n++;return n});
for(const mode of ['light','dark']){
if(mode==='dark')await p.locator('.theme-toggle').click();
await p.mouse.move(40,250);await p.mouse.move(220,540,{steps:10});await p.waitForTimeout(40);
assert.ok(await pixels()>0);console.log(mode,await p.locator('.dot-trail').evaluate(c=>({color:c.getContext('2d').fillStyle,blend:getComputedStyle(c).mixBlendMode,pointerEvents:getComputedStyle(c).pointerEvents})));
await p.screenshot({path:`.impeccable/review/trail/1440-${mode}.png`});await p.waitForTimeout(800);assert.equal(await pixels(),0);
}
await p.emulateMedia({reducedMotion:'reduce'});await p.mouse.move(450,700,{steps:10});await p.waitForTimeout(50);assert.equal(await pixels(),0);
await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>window.dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',clientX:500,clientY:500})));await p.waitForTimeout(50);assert.equal(await pixels(),0);
await p.mouse.move(650,600);await p.waitForTimeout(30);assert.ok(await pixels()>0);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await pixels(),0);
assert.deepEqual(errors,[]);console.log('fade, reduced motion, touch ignore, blur cleanup, console: pass');await p.close();
const mobile=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await mobile.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await mobile.locator('.menu-toggle').tap();assert.equal(await mobile.locator('#site-nav').isVisible(),true);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.screenshot({path:'.impeccable/review/trail/390.png'});console.log('mobile touch/menu/overflow: pass');await b.close();})().catch(e=>{console.error(e);process.exit(1)});
