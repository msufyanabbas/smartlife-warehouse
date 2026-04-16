import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Warehouse, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect immediately
useEffect(() => {
  console.log('useEffect fired — isLoading:', isLoading, '| user:', user);  // ← add this
  if (!isLoading && user) {
    navigate('/', { replace: true });
  }
}, [user, isLoading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log('in the login method')
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // navigate is handled by the useEffect above once user state updates
    } catch (err: any) {
      if (!err.response) {
        setError('Cannot reach the server. Make sure the backend is running on port 3001.');
      } else {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(', ') : msg || err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,124,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
  src="/w-logo.png"
  alt="Company Logo"
  style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 16 }}
/>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-0.02em',
          }}>
            StockFlow
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>
            Warehouse Management Platform
          </p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            Sign in
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 24 }}>
            Enter your credentials to access the platform
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email" required
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} required
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2,
                  }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius)', padding: '10px 14px',
                color: 'var(--red)', fontSize: 13, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', marginTop: 4, padding: '11px 18px' }}
            >
              {loading ? 'Signing in…' : (<><span>Sign in</span> <ArrowRight size={15} /></>)}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, marginTop: 20 }}>
          Contact your administrator to get access
        </p>
      </div>
    </div>
  );
}