import { PasswordField } from './PasswordField';
import { useState, type FormEvent } from 'react';
import { isValidPassword, passwordChecks } from '../../../shared/account-policy';
import { changeOwnPassword } from '../../../shared/password-change';
import { supabase, createPasswordVerificationClient } from '../lib/supabase';

export function PasswordResetRequest({ close }: { close: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const redirect = new URL(window.location.pathname, window.location.origin);
    redirect.searchParams.set('auth', 'recovery');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.href });
      setMessage(error ? 'No fue posible solicitar el enlace. Intente nuevamente.' : 'Si existe una cuenta con este correo, recibirá un enlace para restablecer su contraseña.');
    } catch { setMessage('No fue posible conectar. Intente nuevamente.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card">
    <h1>Recuperar contraseña</h1><form onSubmit={submit}>
      <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
      <p role="status">{message}</p><button disabled={busy}>Enviar enlace seguro</button>
      <button type="button" className="secondary" onClick={close} disabled={busy}>Volver</button>
    </form></section></main>;
}

export function AccountPassword({ invitation = false, recovery = false, close, onSaved }: {
  invitation?: boolean; recovery?: boolean; close?: () => void; onSaved: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const checks = passwordChecks(password);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!isValidPassword(password)) { setError('Use al menos 8 caracteres, una letra mayúscula y un número.'); return; }
    if (confirmation !== password) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      if (invitation || recovery) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      } else await changeOwnPassword(supabase, createPasswordVerificationClient, currentPassword, password);
      setCurrentPassword(''); setPassword(''); setConfirmation('');
      if (invitation) {
        const { error: activationError } = await supabase.rpc('activate_my_staff_invitation');
        if (activationError) throw activationError;
      }
      await onSaved();
    } catch (reason) { setError(reason instanceof Error && reason.message === 'current_password_incorrect' ? 'Contraseña actual incorrecta.' : 'No fue posible actualizar la contraseña. Revise la conexión o solicite un nuevo enlace.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card">
    <h1>{invitation ? 'Establezca su contraseña' : 'Cambiar contraseña'}</h1>
    <form onSubmit={submit}>
      {!invitation && !recovery && <label>Contraseña actual<PasswordField autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={busy} required /></label>}
      <label>Nueva contraseña<PasswordField autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required /></label>
      <div className="password-rules" aria-live="polite">
        <span>{checks.length ? '✓' : '○'} Mínimo 8 caracteres</span>
        <span>{checks.uppercase ? '✓' : '○'} Incluye una letra mayúscula</span>
        <span>{checks.number ? '✓' : '○'} Incluye un número</span>
      </div>
      <label>Confirmar nueva contraseña<PasswordField autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} required /></label>
      {error && <p role="alert" className="alert error">{error}</p>}
      <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      {close && <button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button>}
    </form>
  </section></main>;
}
