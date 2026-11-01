import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { initial, step, replay } from '../public/engine.js';

test('host permissions, independent viewer entry, verified score, replay and persistence', async () => {
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-'));
  let app=createApp({port:0,dataDir,hostKey:'test-host-key'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  let base=`http://127.0.0.1:${app.server.address().port}`;
  const get=async route=>{const r=await fetch(base+route);return {status:r.status,body:await r.json()};};
  const post=async(route,data,cookie,origin)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try {
    assert.equal((await post('/api/challenges',{snapshot:initial()})).status,401);
    assert.equal((await post('/api/host-session',{key:'wrong'})).status,403);
    const {cookie}=await post('/api/host-session',{key:'test-host-key'});assert.ok(cookie);
    assert.equal((await post('/api/challenges',{snapshot:initial()},cookie,'https://evil.example')).status,403);
    const {body:c,status}=await post('/api/challenges',{snapshot:initial(),title:'A real challenge'},cookie);assert.equal(status,201);
    assert.equal((await post('/api/challenges',{snapshot:{...initial(),x:Infinity}},cookie)).status,400);
    const {body:ticket}=await post('/api/runs/start',{challengeId:c.id,name:'Viewer One'});
    let s={...c.snapshot}; const inputs=[];while(s.status==='running'){inputs.push(0);s=step(s,0,undefined,c.finish);}
    assert.equal((await post('/api/runs',{ticket:ticket.ticket,inputs:[4]})).status,400);
    const result=await post('/api/runs',{ticket:ticket.ticket,inputs,score:999999});assert.equal(result.status,201);
    assert.equal(result.body.run.distance,replay(c.snapshot,inputs,c.finish).distance);
    assert.equal(result.body.run.identity,'guest');
    assert.equal((await post('/api/runs',{ticket:ticket.ticket,inputs})).status,400);
    const replayResult=await get(`/api/replays/${c.id}/${result.body.run.id}`);assert.equal(replayResult.status,200);assert.equal(replayResult.body.trace.length,inputs.length+1);
    const {body:ticket2}=await post('/api/runs/start',{challengeId:c.id,name:'Viewer One'});
    await post('/api/runs',{ticket:ticket2.ticket,inputs});
    const state=await get('/api/state');assert.equal(state.body.challenge.attempts,2);assert.equal(state.body.challenge.leaderboard.length,1);
    assert.ok(!JSON.stringify(state.body).includes('test-host-key'));assert.ok(!JSON.stringify(state.body).includes('inputs'));
    app.close();
    app=createApp({port:0,dataDir,hostKey:'test-host-key'});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;
    const restored=await get('/api/state');assert.equal(restored.body.challenge.id,c.id);assert.equal(restored.body.challenge.attempts,2);
    assert.equal((await get('/api/me')).body.host,false);
  }finally{app.close();rmSync(dataDir,{recursive:true,force:true});}
});

test('public tunnel shares public URLs, uses polling, and keeps host routes private', async()=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-public-'));
  const origin='https://demo.trycloudflare.com';
  const app=createApp({port:0,dataDir,hostKey:'test-only-host-key',publicUrl:origin});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  try{
    const state=await (await fetch(base+'/api/state')).json();
    assert.equal(state.updates,'poll');assert.ok(state.challenge.shareUrl.startsWith(origin+'/c/'));
    const denied=await fetch(base+'/api/host-session',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'});
    assert.equal(denied.status,403);
    const privateFile=await fetch(base+'/.env');assert.equal(privateFile.status,404);
    const start=await fetch(base+'/api/runs/start',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({challengeId:state.challenge.id,name:'Remote guest'})});
    assert.equal(start.status,201);
  }finally{app.close();rmSync(dataDir,{recursive:true,force:true});}
});

test('owner OAuth binds the browser, rejects other accounts, and unlocks only the owner',async()=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-oauth-'));
  const realFetch=globalThis.fetch,realSocket=globalThis.WebSocket;
  let login='someone_else';
  class Socket extends EventTarget{close(){this.dispatchEvent(new Event('close'));}}
  globalThis.WebSocket=Socket;
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('id.twitch.tv/oauth2/token'))return Response.json({access_token:'dummy-access',refresh_token:'dummy-refresh'});
    if(String(url).includes('id.twitch.tv/oauth2/validate'))return Response.json({client_id:'dummy-client',user_id:'123',login,scopes:['user:read:chat','user:write:chat']});
    return realFetch(url,options);
  };
  const app=createApp({port:0,dataDir,publicUrl:'https://demo.trycloudflare.com',hostKey:'test-host-key',clientId:'dummy-client',clientSecret:'dummy-secret',ownerChannel:'the_owner'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const begin=async()=>{
    const r=await fetch(base+'/auth/twitch',{redirect:'manual'});assert.equal(r.status,302);
    const location=new URL(r.headers.get('location'));
    assert.equal(location.hostname,'id.twitch.tv');assert.equal(location.searchParams.get('scope'),'user:read:chat user:write:chat');
    return {state:location.searchParams.get('state'),cookie:r.headers.getSetCookie()[0].split(';')[0]};
  };
  try{
    const missing=await begin();
    assert.equal((await fetch(base+`/auth/callback?state=${missing.state}&code=dummy`,{redirect:'manual'})).status,403);
    const wrong=await begin();
    const denied=await fetch(base+`/auth/callback?state=${wrong.state}&code=dummy`,{headers:{cookie:wrong.cookie},redirect:'manual'});
    assert.equal(denied.status,403);assert.equal(denied.headers.get('set-cookie'),null);
    assert.equal((await (await fetch(base+'/api/state')).json()).twitch.channel,null);
    login='the_owner';const valid=await begin();
    const accepted=await fetch(base+`/auth/callback?state=${valid.state}&code=dummy`,{headers:{cookie:valid.cookie},redirect:'manual'});
    assert.equal(accepted.status,302);
    const hostCookie=accepted.headers.getSetCookie().find(x=>x.startsWith('btm_host=')).split(';')[0];
    assert.match(hostCookie,/btm_host=.+/);
    assert.equal((await (await fetch(base+'/api/me',{headers:{cookie:hostCookie}})).json()).host,true);
    assert.equal((await fetch(base+`/auth/callback?state=${valid.state}&code=dummy`,{headers:{cookie:valid.cookie},redirect:'manual'})).status,403);
  }finally{app.close();globalThis.fetch=realFetch;globalThis.WebSocket=realSocket;rmSync(dataDir,{recursive:true,force:true});}
});
