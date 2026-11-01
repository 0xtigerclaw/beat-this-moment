import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchBridge } from '../twitch.mjs';

test('broadcaster chat commands subscribe, reply, deduplicate, and respect cooldowns', async () => {
  const realFetch=globalThis.fetch, realSocket=globalThis.WebSocket;
  const sockets=[], calls=[], commands=[];
  class Socket extends EventTarget {
    constructor(url){super();this.url=url;sockets.push(this);}
    close(){this.dispatchEvent(new Event('close'));}
    message(type,payload,messageId='event-1'){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({metadata:{message_type:type,message_id:messageId},payload})}));}
  }
  globalThis.WebSocket=Socket;
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),body:options.body});
    if(String(url).includes('/oauth2/token'))return Response.json({access_token:'dummy-token',refresh_token:'dummy-refresh'});
    if(String(url).includes('/validate'))return Response.json({client_id:'dummy-client',user_id:'123',login:'testchannel',scopes:['user:read:chat','user:write:chat']});
    return Response.json({data:[{is_sent:true}]});
  };
  const bridge=new TwitchBridge({clientId:'dummy-client',clientSecret:'dummy-secret',redirectUri:'http://localhost/auth/callback',onCommand:async(command,user)=>{commands.push({command,user});return 'Challenge link';}});
  try{
    await bridge.authorize('dummy-code');
    sockets[0].message('session_welcome',{session:{id:'session-1',keepalive_timeout_seconds:20}});
    await new Promise(setImmediate);
    assert.equal(bridge.state.connected,true);
    const subscribe=calls.find(c=>c.url.endsWith('eventsub/subscriptions'));
    assert.deepEqual(JSON.parse(subscribe.body).condition,{broadcaster_user_id:'123',user_id:'123'});
    const payload={event:{chatter_user_id:'123',chatter_user_name:'Broadcaster',message_id:'chat-1',message:{text:'!challenge'}}};
    sockets[0].message('notification',payload,'notice-1');await new Promise(setImmediate);
    sockets[0].message('notification',payload,'notice-1');
    sockets[0].message('notification',payload,'notice-2');await new Promise(setImmediate);
    assert.equal(commands.length,1);assert.equal(commands[0].command,'!challenge');
    const reply=calls.find(c=>c.url.endsWith('chat/messages'));assert.equal(JSON.parse(reply.body).reply_parent_message_id,'chat-1');
    sockets[0].message('revocation',{});await new Promise(setImmediate);
    assert.equal(bridge.state.connected,false);assert.match(bridge.state.error,/revoked/);
  }finally{bridge.disconnect();globalThis.fetch=realFetch;globalThis.WebSocket=realSocket;}
});

test('public hosting requires a host key even when tunnelling localhost', async()=>{
  const {createApp}=await import('../server.mjs');
  assert.throws(()=>createApp({publicUrl:'https://example.com',hostKey:''}),/HOST_KEY/);
});
