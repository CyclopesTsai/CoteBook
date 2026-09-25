import { PASSWORD_MIN_LENGTH } from '@cotebook/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useInstanceConfig, useLogin, useRegister } from '../api/queries';

const KNOWN_ERRORS = [
  'invalid_credentials',
  'email_taken',
  'registration_disabled',
  'rate_limited',
  'validation_failed',
] as const;

function useErrorMessage(error: unknown): string | null {
  const { t } = useTranslation();
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.code === 'network_error') return t('app.networkError');
    const known = KNOWN_ERRORS.find((c) => c === error.code);
    if (known) return t(`auth.errors.${known}`);
  }
  return t('auth.errors.generic');
}

function useRedirectTarget() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith('/') ? from : '/';
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const login = useLogin();
  const config = useInstanceConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = useErrorMessage(login.error);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(target, { replace: true }) });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{t('auth.loginTitle')}</h1>
        <form onSubmit={onSubmit}>
          <label className="field">
            {t('auth.email')}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            {t('auth.password')}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button button-primary" type="submit" disabled={login.isPending}>
            {t('auth.login')}
          </button>
        </form>
        {config.data?.registrationEnabled !== false && (
          <p className="auth-switch">
            {t('auth.noAccount')} <Link to="/register">{t('auth.register')}</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useRegister();
  const config = useInstanceConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const error = useErrorMessage(register.error);

  if (config.data && !config.data.registrationEnabled) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>{t('auth.registerTitle')}</h1>
          <p className="form-note">{t('auth.registrationDisabled')}</p>
          <p className="auth-switch">
            <Link to="/login">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate(
      { email, password, displayName: displayName.trim() || undefined },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{t('auth.registerTitle')}</h1>
        <form onSubmit={onSubmit}>
          <label className="field">
            {t('auth.displayName')}
            <input
              type="text"
              autoComplete="name"
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="field">
            {t('auth.email')}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            {t('auth.password')}
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="field-hint">
              {t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
            </span>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <p className="form-note">{t('auth.noPasswordReset')}</p>
          <button className="button button-primary" type="submit" disabled={register.isPending}>
            {t('auth.register')}
          </button>
        </form>
        <p className="auth-switch">
          {t('auth.haveAccount')} <Link to="/login">{t('auth.login')}</Link>
        </p>
      </div>
    </div>
  );
}
