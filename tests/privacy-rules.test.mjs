import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,writeBatch,runTransaction,Timestamp,serverTimestamp} from 'firebase/firestore';
let env,expiry;
const code='123456', db=uid=>env.authenticatedContext(uid).firestore();
const card=(id,author)=>({id,author,authorName:author,text:'SECRET '+author,column:'good',votes:{},createdAt:Date.now(),expiresAt:expiry});
const preview=c=>({id:c.id,author:c.author,column:c.column,expiresAt:c.expiresAt});
const ref=(d,id)=>doc(d,'rooms',code,'cards',id),pr=(d,id)=>doc(d,'rooms',code,'cardPreviews',id),rr=d=>doc(d,'rooms',code);
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-retro-privacy',firestore:{host:'127.0.0.1',port:8787,rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}})});
after(async()=>{await env.cleanup()});
beforeEach(async()=>{await env.clearFirestore();expiry=Timestamp.fromMillis(Date.now()+86400000);await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(),b=writeBatch(d);b.set(rr(d),{name:'Test',admin:'admin',createdAt:Timestamp.now(),expiresAt:expiry,revealed:false,phase:0,columns:[{id:'good'}]});for(const uid of ['admin','alice','bob'])b.set(doc(d,'rooms',code,'members',uid),{uid,name:uid,expiresAt:expiry});for(const [id,uid] of [['a','alice'],['b','bob'],['c','admin']]){const data=card(id,uid);b.set(ref(d,id),data);b.set(pr(d,id),preview(data))}await b.commit()})});
test('private text belongs only to author, including for room admin',async()=>{
 for(const uid of ['admin','alice','bob']){
  const d=db(uid),own={admin:'c',alice:'a',bob:'b'}[uid];
  await assertSucceeds(getDoc(ref(d,own)));
  for(const other of ['a','b','c'].filter(id=>id!==own))await assertFails(getDoc(ref(d,other)));
  const result=await assertSucceeds(getDocs(query(collection(d,'rooms',code,'cards'),where('author','==',uid))));assert.equal(result.size,1);
  await assertFails(getDocs(collection(d,'rooms',code,'cards')));
  const previews=await assertSucceeds(getDocs(collection(d,'rooms',code,'cardPreviews')));assert.equal(previews.size,3);for(const p of previews.docs)assert.deepEqual(Object.keys(p.data()).sort(),['author','column','expiresAt','id']);
 }
 await assertFails(getDocs(collection(db('outsider'),'rooms',code,'cardPreviews')));
});
test('private admin cannot edit, move or delete others; author can edit own',async()=>{
 const a=db('admin'),alice=db('alice');await assertFails(updateDoc(ref(a,'a'),{text:'stolen edit'}));await assertFails(updateDoc(ref(a,'a'),{column:'improve'}));await assertFails(deleteDoc(ref(a,'a')));await assertSucceeds(updateDoc(ref(alice,'a'),{text:'my edit'}));await assertFails(updateDoc(ref(alice,'b'),{text:'other edit'}));await assertFails(updateDoc(ref(alice,'a'),{author:'admin'}));await assertFails(updateDoc(rr(alice),{name:'hijack',columns:[]}));
});
test('public preview rejects text, spoofing and wrong expiration',async()=>{
 const d=db('alice'),p=preview(card('a','alice'));
 await assertFails(setDoc(pr(d,'a'),{...p,text:'leak'}));await assertFails(setDoc(pr(d,'a'),{...p,author:'bob'}));await assertFails(setDoc(pr(d,'a'),{...p,column:'spoof'}));await assertFails(setDoc(pr(d,'a'),{...p,expiresAt:Timestamp.now()}));await assertFails(setDoc(pr(db('admin'),'a'),p));
});
test('atomic create, move and delete keep previews in sync',async()=>{
 const d=db('alice'),c=card('new','alice');let b=writeBatch(d);b.set(ref(d,'new'),c);b.set(pr(d,'new'),preview(c));await assertSucceeds(b.commit());b=writeBatch(d);b.update(ref(d,'new'),{column:'action'});b.set(pr(d,'new'),{...preview(c),column:'action'});await assertSucceeds(b.commit());assert.equal((await getDoc(pr(d,'new'))).data().column,'action');b=writeBatch(d);b.delete(ref(d,'new'));b.delete(pr(d,'new'));await assertSucceeds(b.commit());assert.equal((await getDoc(pr(d,'new'))).exists(),false);
});
test('legacy cards can receive previews and missing previews do not prevent deletion',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await deleteDoc(pr(c.firestore(),'a'))});const d=db('alice');await assertSucceeds(setDoc(pr(d,'a'),preview(card('a','alice'))));await env.withSecurityRulesDisabled(async c=>{await deleteDoc(pr(c.firestore(),'a'))});const b=writeBatch(d);b.delete(ref(d,'a'));b.delete(pr(d,'a'));await assertSucceeds(b.commit());
});
test('reveal permits all text, moderation, merging and individual votes; hiding revokes reads',async()=>{
 const a=db('admin'),alice=db('alice');await assertFails(updateDoc(ref(alice,'b'),{votes:{alice:true}}));await assertSucceeds(updateDoc(rr(a),{revealed:true}));assert.equal((await assertSucceeds(getDocs(collection(alice,'rooms',code,'cards')))).size,3);await assertSucceeds(updateDoc(ref(alice,'b'),{votes:{alice:true}}));await assertFails(updateDoc(ref(alice,'b'),{votes:{alice:true,bob:true}}));
 await assertSucceeds(runTransaction(a,async tx=>{const ar=ref(a,'a'),br=ref(a,'b');const [x,y]=await Promise.all([tx.get(ar),tx.get(br)]);tx.update(br,{text:y.data().text+'\n'+x.data().text,groupSize:2,votes:{alice:true}});tx.delete(ar);tx.delete(pr(a,'a'));tx.set(pr(a,'b'),preview(y.data()))}));
 await assertSucceeds(updateDoc(rr(a),{revealed:false}));await assertFails(getDoc(ref(a,'b')));await assertSucceeds(getDoc(ref(db('bob'),'b')));await assertFails(updateDoc(ref(db('bob'),'b'),{text:'erase group'}));await assertFails(getDoc(ref(alice,'b')));assert.equal((await getDocs(collection(a,'rooms',code,'cardPreviews'))).size,2);
});
test('room and admin membership can be created in one transaction',async()=>{
 const d=db('new-admin'),r=doc(d,'rooms','654321'),expiry=Timestamp.fromMillis(Date.now()+86400000);await assertSucceeds(runTransaction(d,async tx=>{await tx.get(r);tx.set(r,{name:'New',admin:'new-admin',createdAt:serverTimestamp(),expiresAt:expiry,revealed:false,phase:0,columns:[{id:'good'}]});tx.set(doc(d,'rooms','654321','members','new-admin'),{uid:'new-admin',name:'New Admin',expiresAt:expiry})}));
});
test('expired text and previews are denied',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await updateDoc(rr(c.firestore()),{expiresAt:Timestamp.fromMillis(Date.now()-1000)})});await assertFails(getDoc(ref(db('alice'),'a')));await assertFails(getDocs(collection(db('admin'),'rooms',code,'cardPreviews')));
});
