/* Firebase's hosted recovery flow validates the link and sets the new password.
 * This page never asks for, reads or changes a password during recovery. */
(() => {
  const button = document.getElementById('passwordRecovery');
  if (!button) return;
  const email = document.querySelector('#loginEmail') || document.querySelector('#adminLoginForm input[name="email"]');
  const notice = document.getElementById('passwordRecoveryNotice');
  let key = '', busy = false, cooldown = 0;
  const copy = {
    button: ['¿Olvidaste tu contraseña?', 'Forgot your password?'],
    invalid: ['Escribe tu correo electrónico en el campo de arriba para recibir el enlace de recuperación.', 'Enter your email address in the field above to request a password reset link.'],
    sending: ['Solicitando el enlace…', 'Requesting your reset link…'],
    sent: ['Si existe una cuenta con ese correo, recibirás un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.', 'If an account exists for that email address, you’ll receive a link to set a new password. Check your spam folder too.'],
    wait: ['Espera un minuto antes de solicitar otro enlace.', 'Please wait a minute before requesting another link.'],
    network: ['No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.', 'Could not connect. Check your internet connection and try again.'],
    unavailable: ['No pudimos solicitar el enlace ahora. Inténtalo de nuevo más tarde.', 'We couldn’t request a reset link right now. Please try again later.']
  };
  const lang = () => window.ClinicI18n?.language === 'es' ? 'es' : 'en';
  function render() {
    const index = lang() === 'es' ? 0 : 1;
    button.textContent = copy.button[index];
    notice.textContent = key ? copy[key][index] : '';
    notice.hidden = !key;
    button.disabled = busy;
  }
  window.ClinicPasswordRecovery = { relocalize: render };
  window.addEventListener('clinic-language-change', render);
  button.addEventListener('click', async () => {
    if (busy) return;
    email.value = email.value.trim();
    if (!email.value || !email.checkValidity()) { key = 'invalid'; render(); email.focus(); return; }
    if (Date.now() < cooldown) { key = 'wait'; render(); return; }
    busy = true; key = 'sending'; render();
    try {
      const instance = document.getElementById('adminLoginForm') ? firebase.app('clinic-owner-console').auth() : firebase.auth();
      instance.languageCode = lang();
      await instance.sendPasswordResetEmail(email.value);
      key = 'sent'; cooldown = Date.now() + 60000;
    } catch (error) {
      // Do not disclose whether the email belongs to an existing account.
      if (['auth/user-not-found', 'auth/user-disabled'].includes(error.code)) { key = 'sent'; cooldown = Date.now() + 60000; }
      else if (error.code === 'auth/too-many-requests') { key = 'wait'; cooldown = Date.now() + 60000; }
      else key = error.code === 'auth/network-request-failed' ? 'network' : 'unavailable';
    } finally { busy = false; render(); }
  });
  render();
})();
