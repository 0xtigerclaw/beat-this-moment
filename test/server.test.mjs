import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { initial, step, replay } from '../public/engine.js';
import { play } from './support/solver.mjs';

test('hard-course upgrade preserves classic challenge links and creates only one new round', async () => {
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-upgrade-'));
  const snapshot=initial(41,1),inputs=Array(59).fill(0),result=replay(snapshot,inputs,1690);
  const run={id:'old-run',name:'Classic racer',playerId:'classic',identity:'guest',inputs,ticks:result.ticks,seconds:result.seconds,distance:result.distance,completed:false,jumps:0,createdAt:1};
  writeFileSync(path.join(dataDir,'challenges.json'),JSON.stringify({activeId:'classic',challenges:[{id:'classic',title:'Classic',snapshot,finish:1690,createdAt:1,runs:[run]}]}));
  let app=createApp({dataDir,port:0});
  try {
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    let base=`http://127.0.0.1:${app.server.address().port}`;
    const active=await(await fetch(base+'/api/state')).json();
    assert.equal(active.challenge.snapshot.version,2);assert.equal(active.challenge.finish-snapshot.x,2200);
    const classic=await(await fetch(base+'/api/challenges/classic')).json();
    assert.equal(classic.attempts,1);assert.equal(classic.snapshot.version,1);
    const ghost=await(await fetch(base+'/api/replays/classic/old-run')).json();
    assert.deepEqual(ghost.trace,result.trace);
    app.close();app=createApp({dataDir,port:0});
    await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
    const restored=await(await fetch(base+'/api/state')).json();
    assert.equal(restored.challenge.id,active.challenge.id);assert.equal(restored.history.length,2);
  } finally {app.close();rmSync(dataDir,{recursive:true,force:true});}
});

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

const rateApp=async options=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-rate-'));
  const app=createApp({port:0,dataDir,hostKey:'test-host-key',...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=async(route,forwarded,data={})=>(await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(forwarded?{'X-Forwarded-For':forwarded}:{})},body:JSON.stringify(data)})).status;
  const play=forwarded=>post('/api/runs/start',forwarded);
  return {post,play,stop(){app.close();rmSync(dataDir,{recursive:true,force:true});}};
};

test('behind a trusted proxy, one address reaching the limit does not affect another',async()=>{
  const {play,post,stop}=await rateApp({trustProxy:true});
  try{
    for(let i=0;i<600;i++)assert.notEqual(await play('203.0.113.1'),429);
    assert.equal(await play('203.0.113.1'),429);
    assert.equal(await play('198.51.100.9, 203.0.113.1'),429);
    assert.notEqual(await play('203.0.113.2'),429);
    assert.equal(await post('/api/host-session','203.0.113.1',{key:'test-host-key'}),200);
    assert.notEqual(await play(),429);
    assert.notEqual(await play('not-an-address'),429);
  }finally{stop();}
});

test('without proxy trust, changing X-Forwarded-For does not get around the limit',async()=>{
  const {play,stop}=await rateApp({trustProxy:false});
  try{
    for(let i=0;i<600;i++)assert.notEqual(await play(`203.0.113.${i%250}`),429);
    assert.equal(await play('198.51.100.1'),429);
    assert.equal(await play(),429);
  }finally{stop();}
});

test('host key guesses hit their own limit while players still get through',async()=>{
  const {play,post,stop}=await rateApp({trustProxy:true});
  try{
    for(let i=0;i<10;i++)assert.equal(await post('/api/host-session','203.0.113.1',{key:`guess-${i}`}),403);
    assert.equal(await post('/api/host-session','203.0.113.1',{key:'guess-10'}),429);
    assert.equal(await post('/api/host-session','203.0.113.1',{key:'test-host-key'}),429);
    assert.notEqual(await play('203.0.113.1'),429);
    assert.equal(await post('/api/host-session','203.0.113.2',{key:'test-host-key'}),200);
  }finally{stop();}
});

test('TRUST_PROXY in the environment turns proxy trust on only for 1 or true',async()=>{
  const saved=process.env.TRUST_PROXY;
  const limited=async value=>{
    process.env.TRUST_PROXY=value;
    const {post,stop}=await rateApp();
    try{
      for(let i=0;i<10;i++)await post('/api/host-session','203.0.113.1',{key:'guess'});
      return await post('/api/host-session','203.0.113.2',{key:'guess'})===429;
    }finally{stop();}
  };
  try{
    assert.equal(await limited('1'),false);
    assert.equal(await limited('true'),false);
    assert.equal(await limited('0'),true);
    assert.equal(await limited(''),true);
  }finally{if(saved===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=saved;}
});

async function moderationApp(options={}){
  const dataDir=mkdtempSync(path.join(tmpdir(),'btm-p1-'));
  const app=createApp({port:0,dataDir,hostKey:'test-host-key',...options});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const announced=[];app.twitch.announce=async message=>{announced.push(message);return true;};
  const post=async(route,data,cookie)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const {cookie}=await post('/api/host-session',{key:'test-host-key'});
  const {challenge}=await(await fetch(base+'/api/state')).json();
  // A short final stretch keeps runs inside the server's real-time check without slow test waits.
  const {body:c}=await post('/api/challenges',{snapshot:{...initial(),x:3100},title:'Short'},cookie);
  const stop=()=>{app.close();rmSync(dataDir,{recursive:true,force:true});};
  return {app,base,post,cookie,c,challenge,announced,stop};
}

test('/play sends viewers to the active challenge',async()=>{
  const {base,c,stop}=await moderationApp();
  try{
    const r=await fetch(base+'/play',{redirect:'manual'});
    assert.equal(r.status,302);assert.equal(r.headers.get('location'),`/c/${c.id}`);
  }finally{stop();}
});

test('guest names are filtered, including letter swaps and added terms, but ordinary names pass',async()=>{
  const {post,c,stop}=await moderationApp({blockedNames:['spoiler']});
  try{
    for(const name of ['r3tard_99','K.I.K.E','fag','Spoiler Alert'])assert.equal((await post('/api/runs/start',{challengeId:c.id,name})).status,400,name);
    for(const name of ['Fagan','Spice Girl','Raccoon','Grape Ape','Guest-636'])assert.equal((await post('/api/runs/start',{challengeId:c.id,name})).status,201,name);
  }finally{stop();}
});

test('publishing announces in chat, and hosts can remove a player from the board',async()=>{
  const {base,post,cookie,c,announced,stop}=await moderationApp();
  try{
    assert.equal(announced.length,1);assert.match(announced[0],/New challenge: "Short"/);assert.ok(announced[0].includes(`/c/${c.id}`));
    const submit=async name=>{
      const {body:{ticket}}=await post('/api/runs/start',{challengeId:c.id,name});
      let s={...c.snapshot};const inputs=[];while(s.status==='running'){inputs.push(0);s=step(s,0,undefined,c.finish);}
      await new Promise(r=>setTimeout(r,0));
      return post('/api/runs',{ticket,inputs});
    };
    const first=await submit('Bad Name');await submit('Bad Name');const other=await submit('Viewer');
    assert.equal(first.status,201);assert.equal(other.status,201);
    assert.equal((await post('/api/runs/remove',{challengeId:c.id,runId:first.body.run.id})).status,401);
    const removed=await post('/api/runs/remove',{challengeId:c.id,runId:first.body.run.id},cookie);
    assert.equal(removed.status,200);assert.deepEqual(removed.body.leaderboard.map(r=>r.name),['Viewer']);
    const state=await(await fetch(base+`/api/challenges/${c.id}`)).json();assert.equal(state.attempts,1);
    assert.equal((await post('/api/runs/remove',{challengeId:c.id,runId:first.body.run.id},cookie)).status,404);
  }finally{stop();}
});

test('a new finished leader is announced, throttled to the latest, and crashes stay quiet',async()=>{
  const {post,c,announced,stop}=await moderationApp({leadAnnounceGap:150});
  const submit=async(name,inputs)=>{
    const {body:{ticket}}=await post('/api/runs/start',{challengeId:c.id,name});
    await new Promise(r=>setTimeout(r,30));
    const result=await post('/api/runs',{ticket,inputs});assert.equal(result.status,201);
    return result.body.run;
  };
  try{
    announced.length=0;
    let s={...c.snapshot};const crash=[];while(s.status==='running'){crash.push(0);s=step(s,0,undefined,c.finish);}
    assert.equal(s.status,'crashed');
    await submit('Crasher',crash);
    assert.equal(announced.length,0);
    const slow=play(c.snapshot,false,c.finish).inputs,fast=play(c.snapshot,true,c.finish).inputs;
    assert.ok(fast.length<slow.length);
    await submit('Steady',slow);
    assert.equal(announced.length,1);assert.match(announced[0],/New leader on "Short": Steady at /);
    await submit('Steady Two',slow);
    assert.equal(announced.length,1,'an equal time does not take the lead');
    await submit('Evil.com',fast);
    assert.equal(announced.length,1,'a second leader waits for the gap');
    await new Promise(r=>setTimeout(r,220));
    assert.equal(announced.length,2);assert.match(announced[1],/: Evilcom at /);assert.ok(!announced[1].includes('Evil.com'));
  }finally{stop();}
});
