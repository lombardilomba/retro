import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canReadCard,publicPreview,cardViews} from '../privacy.js';
const expiry=Date.now()+86400000,privateRoom={id:'123456',name:'Test',admin:'admin',expiresAt:expiry,revealed:false,columns:[{id:'good',name:'Good',description:'',color:'green',symbol:'+'}]};
const alice={id:'a',author:'alice',authorName:'Alice',text:'ALICE SECRET <img src=x>',column:'good',expiresAt:expiry,votes:{bob:true}},adminCard={id:'c',author:'admin',authorName:'Admin',text:'ADMIN SECRET',column:'good',expiresAt:expiry,votes:{}};
test('projection never includes nonauthor private text, names or votes',()=>{
 for(const uid of ['admin','alice','bob']){
  const views=cardViews([alice,adminCard],[publicPreview(alice),publicPreview(adminCard)],false,uid);
  for(const c of views){assert.equal(canReadCard(c,false,uid),c.author===uid);if(c.author!==uid){assert.equal(c._private,true);assert.equal(c.text,undefined);assert.equal(c.authorName,undefined);assert.equal(c.votes,undefined)}}
 }
 assert.equal(cardViews([alice],[],true,'admin')[0].text,alice.text);
});
test('safe preview ignores injected sensitive fields and supports metadata-only cards',()=>{
 const p=publicPreview({...alice,text:'secret',excerpt:'leak',votes:{admin:true}});assert.deepEqual(Object.keys(p).sort(),['author','column','expiresAt','id']);const views=cardViews([], [p],false,'admin');assert.equal(views.length,1);assert.equal(views[0]._private,true);
});
test('app renders blur without text in DOM/ARIA, excludes admin editing, and resubscribes safely',async()=>{
 const nodes=new Map(),listeners=new Map(),storage=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},addEventListener(event,fn){listeners.set(key+':'+event,fn)},showModal(){this.open=true},close(){this.open=false},setAttribute(){}});return nodes.get(key)};
 const globals=['document','localStorage','BroadcastChannel','window','location','history','setInterval','clearInterval','setTimeout','clearTimeout'];const previous=new Map(globals.map(k=>[k,globalThis[k]]));
 globalThis.document={querySelector:node,querySelectorAll:()=>[]};globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};globalThis.BroadcastChannel=class{postMessage(){}};globalThis.window={FIREBASE_CONFIG:null};globalThis.location={search:'',pathname:'/retro/'};globalThis.history={replaceState(){}};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 const temp=await mkdtemp(join(tmpdir(),'retro-privacy-'));
 try{
  const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace("'./privacy.js'",JSON.stringify(new URL('../privacy.js',import.meta.url).href));
  const file=join(temp,'app.mjs');await writeFile(file,source+`\nexport {render,cardHTML,canEditCard,patchCard,putCard,deleteCard,handle,loadRoom};export const setState=s=>{if(s.room)room=s.room;if(s.cards)cards=s.cards;if(s.cardPreviews)cardPreviews=s.cardPreviews;if(s.uid)user={uid:s.uid};if(s.firebase)firebase=s.firebase};export const state=()=>({room,cards,cardPreviews});`);
  const app=await import(pathToFileURL(file));app.setState({room:{...privateRoom},cards:[alice,adminCard],cardPreviews:[publicPreview(alice),publicPreview(adminCard)],uid:'admin'});app.render();
  let html=node('#app').innerHTML;assert.ok(!html.includes('ALICE SECRET'));assert.ok(html.includes('ADMIN SECRET'));assert.ok(html.includes('private-blur'));assert.equal(app.canEditCard(alice),false);assert.equal(app.canEditCard(adminCard),true);assert.ok(!app.cardHTML(alice).includes('ALICE SECRET'));
  await assert.rejects(app.patchCard(alice,{text:'tampered'}));
  const oldError=console.error;console.error=()=>{};await app.handle({target:{closest:()=>({dataset:{action:'export'}})}});console.error=oldError;assert.match(node('#toast').textContent,/liberação/);
  app.setState({room:{...privateRoom,revealed:true}});app.render();assert.ok(node('#app').innerHTML.includes('ALICE SECRET'));assert.equal(app.canEditCard(alice),true);
  const subscriptions=[],batches=[];let batch;
  const roomDoc={...privateRoom,expiresAt:{toMillis:()=>expiry}};
  const f={doc:(db,...p)=>({path:p.join('/')}),collection:(db,...p)=>({path:p.join('/')}),where:(...p)=>p,query:(base,filter)=>({...base,filter}),getDoc:async()=>({exists:()=>true,data:()=>roomDoc}),onSnapshot(q,next,error){const sub={q,next,error,active:true};subscriptions.push(sub);return()=>{sub.active=false}},writeBatch(){batch={ops:[],set(ref,data){this.ops.push(['set',ref.path,data])},update(ref,data){this.ops.push(['update',ref.path,data])},delete(ref){this.ops.push(['delete',ref.path])},async commit(){batches.push(this.ops)}};return batch}};
  app.setState({firebase:{f,db:{}}});await app.loadRoom('123456');let contentSub=subscriptions.find(s=>s.q.path.endsWith('/cards'));assert.deepEqual(contentSub.q.filter,['author','==','admin']);
  const previews=subscriptions.find(s=>s.q.path.endsWith('/cardPreviews'));previews.next({docs:[alice,adminCard].map(c=>({id:c.id,data:()=>publicPreview(c)}))});contentSub.next({docs:[{id:'c',data:()=>adminCard}]});assert.ok(!node('#app').innerHTML.includes('ALICE SECRET'));
  const roomSub=subscriptions.find(s=>s.q.path==='rooms/123456');roomSub.next({exists:()=>true,data:()=>({...roomDoc,revealed:true})});assert.equal(contentSub.active,false);
  contentSub=subscriptions.filter(s=>s.q.path.endsWith('/cards')).at(-1);assert.equal(contentSub.q.filter,undefined);contentSub.next({docs:[alice,adminCard].map(c=>({id:c.id,data:()=>c}))});assert.ok(node('#app').innerHTML.includes('ALICE SECRET'));
  node('#modal').showModal();roomSub.next({exists:()=>true,data:()=>roomDoc});assert.equal(node('#modal').open,false);assert.ok(!node('#app').innerHTML.includes('ALICE SECRET'));assert.ok(app.state().cards.every(c=>c.author==='admin'));
  contentSub.next({docs:[{id:'a',data:()=>alice}]});assert.ok(!node('#app').innerHTML.includes('ALICE SECRET'));const current=subscriptions.filter(s=>s.q.path.endsWith('/cards')).at(-1);assert.deepEqual(current.q.filter,['author','==','admin']);
  await app.putCard({...adminCard,id:'new'});assert.deepEqual(batches.at(-1).map(o=>o[1]),['rooms/123456/cards/new','rooms/123456/cardPreviews/new']);assert.equal(batches.at(-1)[1][2].text,undefined);
  await app.patchCard(adminCard,{column:'action'});assert.equal(batches.at(-1)[1][2].column,'action');
  await app.deleteCard(adminCard);assert.ok(batches.at(-1).every(o=>o[0]==='delete'));assert.equal(batches.at(-1).length,2);
 }finally{await rm(temp,{recursive:true,force:true});for(const [key,value]of previous)if(value===undefined)delete globalThis[key];else globalThis[key]=value}
});
