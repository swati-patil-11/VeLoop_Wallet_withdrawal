import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
      <div className="container">
        <Link className="navbar-brand d-flex align-items-center gap-2 fw-bold" to="/wallet">
          <span style={{ fontSize: '1.4rem' }}>🪙</span>
          <span>VELoop Rewards</span>
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navContent"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navContent">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link className="nav-link fw-semibold" to="/wallet">
                My Wallet
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link fw-semibold" to="/payout">
                Withdraw / Redeem
              </Link>
            </li>
          </ul>

          {user && (
            <div className="d-flex align-items-center gap-3 text-light">
              <div className="text-end">
                <div className="fw-semibold small">{user.name}</div>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                  {user.email} <span className="badge bg-secondary ms-1">{user.role}</span>
                </div>
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
