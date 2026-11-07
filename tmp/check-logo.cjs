const {chromium}=require('C:/Users/atene.adm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync('.impeccable/review/logo',{recursive:true});
 const results=[];
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.screenshot({path:`.impeccable/review/logo/${width}.png`,fullPage:true});
  results.push({width,errors,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,logos:[...document.querySelectorAll('.brand-logo')].map(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.width,height:i.height,src:i.getAttribute('src')}))}))});
  if(width===390){await page.locator('.menu-toggle').click();results.push({mobileMenu:await page.locator('#site-nav').isVisible()});await page.keyboard.press('Escape');}
  await page.close();
 }
 for(const motion of ['reduce','no-preference']){
  const page=await browser.newPage({reducedMotion:motion});
  await page.goto('http://127.0.0.1:4173/assets/brand/vitrine-animated.svg');
  const start=await page.locator('.blade-left').evaluate(el=>getComputedStyle(el).transform);
  await page.waitForTimeout(800);
  results.push({motion,start,end:await page.locator('.blade-left').evaluate(el=>getComputedStyle(el).transform),animation:await page.locator('.blade-left').evaluate(el=>getComputedStyle(el).animationName)});
  await page.close();
 }
 console.log(JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
