import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TwitchBridge } from '../twitch.mjs';

test('persisted Twitch credentials refresh, survive shutdown, enforce owner, and clear on disconnect', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'btm-tokens-')),tokenFile=path.join(dir,'tokens.json');
  const originalFetch=globalThis.fetch,originalSocket=globalThis.WebSocket;
  let rejectOld=false,login='owner',connections=0;
  class Socket extends EventTarget { constructor(){super();connections++;} close(){this.dispatchEvent(new Event('close'));} }
  globalThis.WebSocket=Socket;
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('/oauth2/token')) {
      const refresh=options.body.get('grant_type')==='refresh_token';
      return Response.json({access_token:refresh?'new-access':'old-access',refresh_token:refresh?'new-refresh':'old-refresh'});
    }
    if(rejectOld && options.headers.Authorization==='OAuth old-access')return new Response('',{status:401});
    return Response.json({client_id:'test-client',user_id:'123',login,scopes:['user:read:chat','user:write:chat']});
  };
  const make=()=>new TwitchBridge({clientId:'test-client',clientSecret:'test-secret',redirectUri:'https://example.com/auth/callback',tokenFile});
  let bridge=make();
  try {
    await bridge.authorize('test-code','owner');
    assert.equal(statSync(tokenFile).mode & 0o777,0o600);
    bridge.disconnect({forget:false});assert.ok(existsSync(tokenFile));
    rejectOld=true;bridge=make();assert.equal(await bridge.restore('owner'),true);
    assert.equal(bridge.user.login,'owner');
    assert.equal(JSON.parse(readFileSync(tokenFile)).refresh_token,'new-refresh');
    bridge.disconnect({forget:false});
    const before=connections;login='someone_else';bridge=make();
    await assert.rejects(bridge.restore('owner'),/configured owner/);
    assert.equal(connections,before);assert.equal(bridge.tokens,null);
    bridge.disconnect();assert.equal(existsSync(tokenFile),false);
    writeFileSync(tokenFile,'{}');bridge=make();
    await assert.rejects(bridge.restore('owner'),/invalid/);
  } finally { bridge.disconnect();globalThis.fetch=originalFetch;globalThis.WebSocket=originalSocket;rmSync(dir,{recursive:true,force:true}); }
});
