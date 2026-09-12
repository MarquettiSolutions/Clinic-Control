/* Standalone owner entry: no clinic app, Firestore listeners or clinical workspace. */
(() => {
  let language='en';
  try { language=localStorage.getItem('clinicOwnerLanguage')==='es'?'es':'en'; } catch {}
  const copy={brand:['Administración del dueño','Owner administration'],signOut:['Cerrar sesión','Sign out'],private:['ACCESO PRIVADO DEL DUEÑO','PRIVATE OWNER ACCESS'],title:['Administra tu plataforma','Manage your platform'],intro:['Gestiona clínicas, períodos de prueba y actividad comercial. Esta no es la aplicación de la clínica.','Manage clinics, pilot periods and business activity. This is not the clinic workspace.'],email:['Correo electrónico','Email address'],password:['Contraseña','Password'],signIn:['Entrar a la administración','Sign in to administration'],help:['Usa tu cuenta autorizada de dueño. Las cuentas de clínicas no tienen acceso a esta área.','Use your authorized owner account. Clinic accounts cannot access this area.'],website:['Volver a la web pública','Back to the public website'],checking:['Comprobando tu sesión…','Checking your session…'],denied:['Esta cuenta no tiene permiso de dueño. Cierra sesión para entrar con tu cuenta autorizada.','This account does not have owner access. Sign out to use your authorized account.'],credentials:['No se pudo iniciar sesión. Revisa el correo y la contraseña.','Sign-in failed. Check your email and password.'],network:['No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.','Could not connect. Check your connection and try again.'],throttle:['Demasiados intentos. Espera un momento e inténtalo de nuevo.','Too many attempts. Wait a moment and try again.'],unavailable:['La administración no está disponible ahora. Recarga la página para reintentar.','Administration is unavailable right now. Reload the page to retry.']};
  const tr=(es,en)=>language==='es'?es:en;
  const text=key=>copy[key]?.[language==='es'?0:1]||'';
  let auth, authorized=false, version=0, rows=[], cursor=null, loading=false, noticeKey='checking';
  const login=document.getElementById('adminLogin'), form=document.getElementById('adminLoginForm'), root=document.getElementById('platformDialog'), signOut=document.getElementById('adminSignOut');
  function localize(){document.documentElement.lang=language;document.title=`Clinic Control | ${text('brand')}`;root.setAttribute('aria-label',text('brand'));document.querySelectorAll('[data-copy]').forEach(n=>n.textContent=text(n.dataset.copy));document.getElementById('adminAuthNotice').textContent=text(noticeKey);window.ClinicOwnerDashboard.relocalize();}
  window.ClinicI18n={get language(){return language;},setLanguage(value){language=value==='es'?'es':'en';try{localStorage.setItem('clinicOwnerLanguage',language);}catch{}localize();}};
  function authNotice(key){noticeKey=key;document.getElementById('adminAuthNotice').textContent=text(key);}
  function notice(message){const n=root.querySelector('[data-platform-notice]');if(n){n.textContent=message;n.hidden=false;}}
  function errorMessage(error){if(error.message==='invalid-request')return tr('Revisa los campos y la fecha.','Check the fields and date.');if(error.message==='not-found')return tr('Clínica no encontrada. Actualiza el directorio.','Clinic not found. Refresh the directory.');if(error.message==='platform-access-required'||error.message==='unauthenticated')return text('denied');return text('network');}
  function shell(title,content){root.innerHTML='<header class="platform-header"><h1></h1></header><div class="platform-content"></div>';root.querySelector('h1').textContent=title;root.querySelector('.platform-content').innerHTML=content+'<p data-platform-notice role="status" hidden></p>';}
  async function api(action,extra={}){
    const user=auth.currentUser, requestVersion=version;if(!authorized||!user)throw Error('unauthenticated');
    const token=await user.getIdToken();
    const response=await fetch(window.CLINIC_COMMERCE.apiUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...extra})});
    const data=await response.json().catch(()=>({error:'service-unavailable'}));
    if((response.status===401||response.status===403)&&requestVersion===version){authorized=false;version++;rows=[];window.ClinicOwnerDashboard.clear();root.replaceChildren();root.hidden=true;login.hidden=false;form.hidden=true;authNotice('denied');}
    if(!response.ok)throw Error(data.error||'service-unavailable');return data;
  }
  async function load(more=false){if(loading||!authorized)return;loading=true;const ticket=version;try{const data=await api('ownerOverview',more?{cursor}:{});if(ticket!==version||!authorized)return;rows=more?[...rows,...data.clinics]:data.clinics;cursor=data.nextCursor;window.ClinicOwnerDashboard.show({shell,api,notice,errorMessage,reload:()=>load()},rows,Boolean(cursor));}catch(e){if(ticket===version)notice(errorMessage(e));}finally{if(ticket===version)loading=false;}}
  form.addEventListener('submit',async e=>{e.preventDefault();const submit=form.querySelector('button');submit.disabled=true;authNotice('checking');try{await auth.signInWithEmailAndPassword(form.elements.email.value.trim(),form.elements.password.value);form.elements.password.value='';}catch(error){authNotice(error.code==='auth/network-request-failed'?'network':error.code==='auth/too-many-requests'?'throttle':'credentials');}finally{submit.disabled=false;}});
  signOut.addEventListener('click',async()=>{signOut.disabled=true;try{await auth.signOut();}catch{authNotice('network');}finally{signOut.disabled=false;}});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const lang=b.dataset.adminLanguage||b.dataset.language;if(lang)window.ClinicI18n.setLanguage(lang);if(b.hasAttribute('data-owner-more'))load(true);if(b.hasAttribute('data-admin-retry'))load();});
  localize();
  try {
    // Named Firebase app and session persistence keep this login separate from clinic login.
    auth=firebase.initializeApp(window.firebaseConfig,'clinic-owner-console').auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(()=>{
      auth.onAuthStateChanged(async user=>{const ticket=++version;authorized=false;loading=false;rows=[];cursor=null;window.ClinicOwnerDashboard.clear();root.replaceChildren();root.hidden=true;login.hidden=false;form.hidden=Boolean(user);signOut.hidden=!user;authNotice(user?'checking':'');if(!user)return;try{const token=await user.getIdTokenResult(true);if(ticket!==version)return;if(token.claims.platformAdmin!==true){authNotice('denied');return;}authorized=true;login.hidden=true;root.hidden=false;shell(text('brand'),`<p>${text('checking')}</p><button class="btn light" data-admin-retry>${tr('Reintentar','Retry')}</button>`);await load();}catch{if(ticket===version)authNotice('unavailable');}});
    }).catch(()=>authNotice('unavailable'));
  } catch { authNotice('unavailable'); }
})();
