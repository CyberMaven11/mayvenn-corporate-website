"use strict";
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'public');
const PORT=Number(process.env.PORT||3000);
const RATE=new Map();
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
function send(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY',...headers});res.end(JSON.stringify(body));}
function str(x,max){return typeof x==='string'&&x.length<=max?x.trim():null;}
function clean(x){return x.replace(/[\r\n\t]/g,' ').replace(/[<>]/g,'').slice(0,4000);}
function limit(ip){const now=Date.now(),key=crypto.createHash('sha256').update(ip).digest('hex');const history=(RATE.get(key)||[]).filter(t=>t>now-3600000);if(history.length>=5){RATE.set(key,history);return false;}history.push(now);RATE.set(key,history);return true;}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>7500000)throw Error('too_large');}return JSON.parse(raw);}
async function contact(req,res){
  const origin=req.headers.origin;
  const host=req.headers.host;
  if(origin){try{if(new URL(origin).host!==host)return send(res,403,{error:'Invalid request origin.'});}catch{return send(res,403,{error:'Invalid origin.'});}}
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'Use application/json.'});
  const ip=req.socket.remoteAddress||'unknown';if(!limit(ip))return send(res,429,{error:'Too many submissions. Please try again later.'});
  let data;try{data=await body(req);}catch{return send(res,400,{error:'Invalid form submission.'});}
  if(data.website)return send(res,200,{ok:true}); // honeypot; no delivery
  const name=str(data.full_name,150),org=str(data.organization,160),email=str(data.email,240),interest=str(data.interest,160),message=str(data.message,4000);
  if(!name||!org||!email||!interest||!message||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return send(res,400,{error:'Please complete all required fields with a valid email address.'});
  let attachment;
  if(data.resume!==undefined&&data.resume!==null){
    const r=data.resume;
    if(!r||typeof r!=='object'||typeof r.filename!=='string'||typeof r.content!=='string')return send(res,400,{error:'Invalid résumé attachment.'});
    const filename=path.basename(r.filename).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,100);
    const ext=path.extname(filename).toLowerCase();
    if(!['.pdf','.docx'].includes(ext)||!filename||!(/^[A-Za-z0-9+/]*={0,2}$/.test(r.content))||r.content.length>7000000)return send(res,400,{error:'Upload a PDF or DOCX résumé, maximum 5 MB.'});
    const bytes=Buffer.from(r.content,'base64');
    if(bytes.length===0||bytes.length>5*1024*1024)return send(res,400,{error:'Résumé must be 5 MB or smaller.'});
    const valid=ext==='.pdf'?bytes.subarray(0,5).toString('ascii')==='%PDF-':bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
    if(!valid)return send(res,400,{error:'Résumé format does not match the selected file.'});
    attachment={filename,content:r.content};
  }
  const key=process.env.RESEND_API_KEY, sender=process.env.MAYVENN_FROM_EMAIL, to=process.env.MAYVENN_TO_EMAIL||'info@mayvennai.com';
  if(!key||!sender)return send(res,503,{error:'Secure inquiry delivery is not yet configured. Please email info@mayvennai.com directly.'});
  const text=['New Mayvenn website inquiry','Name: '+clean(name),'Organization: '+clean(org),'Email: '+clean(email),'Area: '+clean(interest),'','Requirement:',clean(message)].join('\n');
  try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);let response;try{response=await fetch('https://api.resend.com/emails',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from:sender,to:[to],reply_to:email,subject:'Mayvenn website inquiry — '+clean(interest),text,...(attachment?{attachments:[attachment]}:{})})});}finally{clearTimeout(timeout);}
    if(!response.ok){console.error('Mail provider rejected request:',response.status);return send(res,502,{error:'Delivery unavailable. Please email info@mayvennai.com directly.'});}
    return send(res,200,{ok:true});
  }catch(e){console.error('Mail delivery connection failed');return send(res,502,{error:'Delivery unavailable. Please email info@mayvennai.com directly.'});}
}
const server=http.createServer(async(req,res)=>{
  if(req.url==='/healthz'&&req.method==='GET')return send(res,200,{status:'ok',emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.MAYVENN_FROM_EMAIL)});
  if(req.url==='/api/contact'){if(req.method!=='POST')return send(res,405,{error:'Method not allowed.'},{Allow:'POST'});return contact(req,res);}
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed.'});
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return send(res,400,{error:'Invalid path.'});}
  const requested=pathname==='/'?'/index.html':pathname;const full=path.resolve(ROOT,'.'+requested);
  if(full!==ROOT&&!full.startsWith(ROOT+path.sep))return send(res,403,{error:'Forbidden'});
  let stat;try{stat=fs.statSync(full);}catch{return send(res,404,{error:'Not found'});}
  if(!stat.isFile())return send(res,404,{error:'Not found'});
  const ext=path.extname(full).toLowerCase();res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',...(process.env.STAGING_MODE==='true'?{'X-Robots-Tag':'noindex, nofollow'}:{})});if(req.method==='HEAD')return res.end();fs.createReadStream(full).pipe(res);
});server.listen(PORT,'0.0.0.0',()=>console.log('Mayvenn server listening on '+PORT));
