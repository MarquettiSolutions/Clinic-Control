const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('password-recovery.js','utf8');
function setup(owner=false) {
  const button={addEventListener(_,fn){this.click=fn;}}, notice={}, email={value:'',checkValidity(){return /^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(this.value);},focus(){this.focused=true;}};
  let calls=0, chosen='', reject, pending;
  const auth={sendPasswordResetEmail:async value=>{calls++;assert.equal(value,'person@example.com');if(pending)await pending;if(reject)throw {code:reject};}};
  const win={ClinicI18n:{language:'en'},addEventListener(){}};
  vm.runInNewContext(code,{window:win,document:{getElementById:id=>id==='passwordRecovery'?button:id==='passwordRecoveryNotice'?notice:id==='adminLoginForm'&&owner?{}:null,querySelector:()=>email},firebase:{auth:()=>{chosen='clinic';return auth;},app:name=>{assert.equal(name,'clinic-owner-console');chosen='owner';return {auth:()=>auth};}},Date});
  return {button,notice,email,win,auth,get calls(){return calls;},get chosen(){return chosen;},fail:c=>reject=c,hold:p=>pending=p};
}
(async()=>{
  for(const owner of [false,true]){
    const s=setup(owner);
    assert.equal(s.button.textContent,'Forgot your password?');
    await s.button.click(); assert.equal(s.calls,0);assert.equal(s.email.focused,true);
    s.email.value=' person@example.com ';s.win.ClinicI18n.language='es';
    await s.button.click();assert.equal(s.calls,1);assert.equal(s.auth.languageCode,'es');assert.equal(s.chosen,owner?'owner':'clinic');assert.match(s.notice.textContent,/Si existe una cuenta/);
    await s.button.click();assert.equal(s.calls,1);assert.match(s.notice.textContent,/Espera un minuto/);
    s.win.ClinicI18n.language='en';s.win.ClinicPasswordRecovery.relocalize();assert.match(s.notice.textContent,/Please wait/);
  }
  for(const [error,expected] of [['auth/user-not-found',/If an account exists/],['auth/network-request-failed',/Could not connect/],['auth/too-many-requests',/Please wait/],['auth/internal-error',/couldn’t request/]]){
    const s=setup();s.email.value='person@example.com';s.fail(error);await s.button.click();assert.match(s.notice.textContent,expected);assert.equal(s.button.disabled,false);
  }
  const s=setup();s.email.value='person@example.com';let release;s.hold(new Promise(r=>release=r));const first=s.button.click();await s.button.click();assert.equal(s.calls,1);release();await first;
  for(const file of ['index.html','admin.html']){const html=fs.readFileSync(file,'utf8');assert.match(html,/id="passwordRecovery"[^>]*type="button"/);assert.match(html,/src="password-recovery.js/);}
  assert.match(fs.readFileSync('.github/workflows/deploy.yml','utf8'),/cp .*password-recovery.js/);
  console.log('Password recovery: both sessions, language, validation, neutral response, errors and double-click protection passed. No email sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
