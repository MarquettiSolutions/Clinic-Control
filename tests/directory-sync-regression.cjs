const assert = require('node:assert/strict');
const { createDirectorySync } = require('../functions/directory-sync');
module.exports = async function() {
  const data = new Map([
    ['clinics/legacy/settings/clinic', {clinicName:'Legacy Clinic',clinicEmail:'legacy@example.invalid'}],
    ['clinics/legacy/patients/patient', {name:'Unchanged patient'}],
    ['clinics/existing/settings/clinic', {clinicName:'Updated business name'}],
    ['platformClinics/existing', {name:'Old name',ownerEmail:'existing@example.invalid',status:'archived',pilotEndsAt:'2030-12-31',ownerNote:'Keep this',createdAt:'original'}],
  ]);
  const reads=[], writes=[];
  const ref=path=>({path,async get(){reads.push(path);return {exists:data.has(path),data:()=>data.get(path)}}});
  const db={doc:ref,collection:name=>{assert.equal(name,'clinics');return {listDocuments:async()=>['legacy','existing','incomplete'].map(id=>({id}))}},runTransaction:async callback=>callback({get:r=>r.get(),set(r,value,options){assert.ok(r.path.startsWith('platformClinics/'));assert.equal(options.merge,true);writes.push(r.path);data.set(r.path,{...data.get(r.path),...value})}})};
  const auth={getUser:async id=>({email:`${id}@example.invalid`})};
  const service=createDirectorySync({db,auth,timestamp:()=> 'server-time'});
  const preview=await service.reconcile({dryRun:true});
  assert.equal(preview.created,1);assert.equal(preview.updated,1);assert.equal(preview.skipped,1);assert.equal(writes.length,0);
  const applied=await service.reconcile();assert.equal(applied.created,1);assert.equal(applied.updated,1);
  assert.equal(data.get('platformClinics/legacy').status,'pilot','Missing parent docs must still produce directory entries');
  const existing=data.get('platformClinics/existing');assert.equal(existing.ownerNote,'Keep this');assert.equal(existing.pilotEndsAt,'2030-12-31');assert.equal(existing.status,'archived');assert.equal(existing.createdAt,'original');
  const count=writes.length;const repeated=await service.reconcile();assert.equal(repeated.unchanged,2);assert.equal(writes.length,count,'Repeated sync must not rewrite unchanged records');
  assert.ok(reads.every(path=>path.endsWith('/settings/clinic')||path.startsWith('platformClinics/')),'No patient reads');
  assert.deepEqual(data.get('clinics/legacy/patients/patient'),{name:'Unchanged patient'});
  data.set('clinics/legacy/settings/clinic',{clinicName:'Newest name'});await service.syncClinic('legacy');assert.equal(data.get('platformClinics/legacy').name,'Newest name');
  data.delete('clinics/legacy/settings/clinic');await service.syncClinic('legacy');assert.ok(data.has('platformClinics/legacy'),'Missing settings must never remove directory entries');
  assert.equal((await service.syncClinic('../escape')).outcome,'skipped');
  const missingAuth=createDirectorySync({db,auth:{getUser:async()=>{throw {code:'auth/user-not-found'}}},timestamp:()=> 'server-time'});
  await missingAuth.syncClinic('existing');assert.equal(data.get('platformClinics/existing').ownerEmail,'existing@example.invalid');
  const vm=require('node:vm'), fs=require('node:fs');
  const triggered=[];let triggerOptions, scheduledOptions;
  const modules={
    'firebase-functions/v2/firestore':{onDocumentWritten:(options,handler)=>{triggerOptions=options;return handler}},
    'firebase-functions/v2/scheduler':{onSchedule:(options,handler)=>{scheduledOptions=options;return handler}},
    'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>null}},
    'firebase-admin/auth':{getAuth:()=>auth},
    './directory-sync':{createDirectorySync:()=>({syncClinic:async id=>triggered.push(id),reconcile:async()=>({failed:0})})}
  };
  const context=vm.createContext({require:name=>modules[name],exports:{},console:{log(){}}});
  vm.runInContext(fs.readFileSync('functions/directory-events.js','utf8'),context);
  assert.equal(triggerOptions.document,'clinics/{clinicId}/settings/clinic');assert.equal(triggerOptions.retry,true);
  await context.exports.syncClinicDirectory({data:{after:{exists:true}},params:{clinicId:'new-clinic'}});
  await context.exports.syncClinicDirectory({data:{after:{exists:false}},params:{clinicId:'deleted-clinic'}});
  assert.deepEqual(triggered,['new-clinic']);
  assert.equal(scheduledOptions.schedule,'every day 04:00');
  await context.exports.reconcileClinicDirectory();
  console.log('Directory checks passed: legacy parent discovery, dry run, idempotence, metadata-only writes, preserved owner settings and current source reads.');
};
