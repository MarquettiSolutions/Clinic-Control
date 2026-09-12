const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const records=new Map([
  ['clinics/clinic/settings/clinic',{clinicName:'Fictional Clinic'}],
  ['userProfiles/reception',{clinicId:'clinic',role:'reception',status:'active'}],
  ['userProfiles/admin',{clinicId:'clinic',role:'admin',status:'active'}],
  ['userProfiles/forged',{clinicId:'clinic',role:'admin',status:'active',platformAdmin:true}],
]);
const docs=[];
function ref(path){return {id:path.split('/').pop(),path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),collection:name=>collection(`${path}/${name}`)};}
function collection(path){return {doc:(id='audit')=>ref(`${path}/${id}`),orderBy:()=>({limit:()=>({get:async()=>{const found=path.endsWith('/history')?[...records.entries()].filter(([key])=>key.startsWith(path+'/')).map(([key,value])=>({id:key.split('/').pop(),data:()=>value})):docs;return {size:found.length,docs:found}},startAfter:()=>({get:async()=>({size:0,docs:[]})})})})};}
const db={doc:ref,collection,runTransaction:async fn=>fn({get:r=>r.get(),set:(r,data,options)=>records.set(r.path,options?.merge?{...records.get(r.path),...data}:data),update:(r,data)=>records.set(r.path,{...records.get(r.path),...data}),create:(r,data)=>records.set(r.path,data)})};
const modules={
  'firebase-functions/v2/https':{onRequest:(_,fn)=>fn},
  'firebase-admin/auth':{getAuth:()=>({verifyIdToken:async token=>{if(token==='bad')throw Error();return {uid:token==='owner'?'platform-owner':token,platformAdmin:token==='owner'}},getUser:async()=>({email:'owner@example.test'})})},
  'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>null}}
};
const context=vm.createContext({require:name=>modules[name],exports:{},process:{env:{}},console});
vm.runInContext(fs.readFileSync('functions/platform.js','utf8'),context);
async function request(token,body,origin='https://marquettisolutions.github.io',method='POST'){
 const res={statusCode:200,set(){},status(code){this.statusCode=code;return this},json(data){this.body=data;return this},send(){return this}};
 await context.exports.platformApi({method,headers:{origin,authorization:token?`Bearer ${token}`:''},body},res);return res;
}
(async()=>{
 assert.equal((await request('',{action:'ownerOverview'})).statusCode,401);
 assert.equal((await request('bad',{action:'ownerOverview'})).statusCode,401);
 assert.equal((await request('clinic',{action:'ownerOverview'})).statusCode,403);
 assert.equal((await request('forged',{action:'ownerOverview'})).statusCode,403,'A profile field must never grant platform privileges');
 assert.equal((await request('owner',{action:'ownerOverview'},'https://evil.example')).statusCode,403);
 assert.equal((await request('owner',{action:'ownerOverview'},undefined,'GET')).statusCode,405);
 assert.equal((await request('owner',{action:'ownerOverview'},undefined,'OPTIONS')).statusCode,204);
 assert.equal((await request('reception',{action:'subscription',clinicId:'clinic'})).statusCode,403);
 assert.equal((await request('other',{action:'subscription',clinicId:'clinic'})).statusCode,403);
 assert.equal((await request('clinic',{action:'checkout',clinicId:'clinic'})).body.error,'billing-not-configured');
 assert.equal((await request('admin',{action:'billingPortal',clinicId:'clinic'})).statusCode,503);
 assert.equal((await request('clinic',{action:'subscription',clinicId:'clinic'})).body.status,'pilot');
 assert.equal((await request('clinic',{action:'syncClinic',clinicId:'clinic'})).statusCode,200);
 assert.equal(records.get('platformClinics/clinic').name,'Fictional Clinic');
 docs.push({id:'clinic',data:()=>({...records.get('platformClinics/clinic'),patients:['must never be returned']})});
 const overview=await request('owner',{action:'ownerOverview'});
 assert.equal(overview.statusCode,200);
 assert.equal(overview.body.clinics[0].patients,undefined);
 assert.equal((await request('clinic',{action:'updatePilot',clinicId:'clinic',status:'archived',pilotEndsAt:null})).statusCode,403);
 assert.equal((await request('owner',{action:'updatePilot',clinicId:'clinic',status:'paid',pilotEndsAt:null})).statusCode,400);
 assert.equal((await request('owner',{action:'updatePilot',clinicId:'clinic',status:'pilot',pilotEndsAt:'2026-02-31'})).statusCode,400);
 assert.equal((await request('owner',{action:'updatePilot',clinicId:'clinic',status:'pilot',pilotEndsAt:'2026-12-31'})).statusCode,200);
 assert.equal(records.get('platformAudit/audit').actorUid,'platform-owner');
 assert.equal(records.get('platformClinics/clinic').pilotEndsAt,'2026-12-31');
 for(const action of ['ownerDetails','extendPilot','saveOwnerNote']) {
   assert.equal((await request('clinic',{action,clinicId:'clinic'})).statusCode,403);
   assert.equal((await request('forged',{action,clinicId:'clinic'})).statusCode,403);
 }
 assert.equal((await request('owner',{action:'ownerDetails',clinicId:'missing'})).statusCode,404);
 assert.equal((await request('owner',{action:'ownerDetails',clinicId:'../clinic'})).statusCode,400);
 const extension={action:'extendPilot',clinicId:'clinic',days:14,reason:'Extra evaluation time',requestId:'extension-0000000001'};
 assert.equal((await request('owner',{...extension,days:-1})).statusCode,400);
 assert.equal((await request('owner',{...extension,reason:''})).statusCode,400);
 assert.equal((await request('owner',{...extension,requestId:'short'})).statusCode,400);
 records.get('platformClinics/clinic').pilotEndsAt='2099-01-01';
 assert.equal((await request('owner',extension)).statusCode,200);
 assert.equal(records.get('platformClinics/clinic').pilotEndsAt,'2099-01-15');
 await request('owner',extension);
 assert.equal(records.get('platformClinics/clinic').pilotEndsAt,'2099-01-15','Retry must not double the extension');
 records.get('platformClinics/clinic').pilotEndsAt='2000-01-01';
 await request('owner',{...extension,requestId:'extension-0000000002',days:7});
 const expected=new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z');expected.setUTCDate(expected.getUTCDate()+7);
 assert.equal(records.get('platformClinics/clinic').pilotEndsAt,expected.toISOString().slice(0,10));
 assert.equal((await request('owner',{action:'saveOwnerNote',clinicId:'clinic',note:'Business follow-up',requestId:'note-000000000001'})).statusCode,200);
 const details=(await request('owner',{action:'ownerDetails',clinicId:'clinic'})).body;
 assert.equal(details.clinic.ownerNote,'Business follow-up');
 assert.ok(details.history.some(item=>item.action==='extendPilot'&&item.reason==='Extra evaluation time'));
 assert.equal(details.clinic.patients,undefined);
 assert.equal((await request('owner',{action:'saveOwnerNote',clinicId:'clinic',note:'x'.repeat(2001),requestId:'note-000000000002'})).statusCode,400);
 assert.equal(records.get('clinics/clinic/settings/clinic').clinicName,'Fictional Clinic');
 new vm.Script(fs.readFileSync('owner-dashboard.js','utf8'));
 const adminHtml=fs.readFileSync('admin.html','utf8');
 assert.ok(adminHtml.includes('adminLoginForm'));
 assert.ok(!/<dialog|http-equiv="refresh"|src="app.js|firebase-firestore/.test(adminHtml),'Owner page must not load or redirect to clinic workspace');
 new vm.Script(fs.readFileSync('admin.js','utf8'));
 await require('./admin-entry-regression.cjs')();
 console.log('Platform checks passed: authentication, trusted owner claim, cross-clinic isolation, metadata-only directory, audit, and disabled billing.');
})().catch(error=>{console.error(error);process.exitCode=1});
