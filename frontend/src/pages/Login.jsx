import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('demo@veloop.test');
  const [password, setPassword] = useState('DemoUser123!');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/wallet');
    } catch (err) {
      if (!err.response) {
        // Network failure / CORS failure / Backend offline
        setError(
          `Cannot reach API server (${client.defaults.baseURL}). Please check your VITE_API_BASE_URL setting and ensure your backend is running.`
        );
      } else if (err.response.status === 401) {
        setError(err.response.data?.message || 'Invalid email or password.');
      } else {
        setError(err.response.data?.message || `Server error (HTTP ${err.response.status})`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const autofill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-6 col-lg-5">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <div className="text-center mb-4">
                <span style={{ fontSize: '3rem' }}>🪙</span>
                <h3 className="fw-bold mt-2">VELoop Rewards</h3>
                <p className="text-muted small">Sign in to access your rewards wallet & payouts</p>
              </div>

              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="form-label small fw-semibold">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-100 fw-semibold"
                  disabled={submitting}
                >
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <hr className="my-4" />

              <div className="text-center">
                <span className="small text-muted d-block mb-2">Quick Demo Account Autofill:</span>
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => autofill('demo@veloop.test', 'DemoUser123!')}
                  >
                    Primary User (25,000 VEs)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => autofill('demo2@veloop.test', 'DemoUser123!')}
                  >
                    Secondary User
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-dark"
                    onClick={() => autofill('admin@veloop.test', 'AdminPass123!')}
                  >
                    Admin Account
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

