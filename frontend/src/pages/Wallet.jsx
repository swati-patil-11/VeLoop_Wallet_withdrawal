import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import DevToolsBox from '../components/DevToolsBox';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const navigate = useNavigate();

  const fetchWalletData = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, txRes, withdrawalsRes] = await Promise.all([
        client.get('/wallet/summary'),
        client.get(`/wallet/transactions?page=${page}&limit=10`),
        client.get('/withdrawals?limit=10')
      ]);

      setWallet(summaryRes.data.summary.wallet);
      setSummary(summaryRes.data.summary);
      setTransactions(txRes.data.transactions);
      setPagination(txRes.data.pagination);
      setWithdrawals(withdrawalsRes.data.withdrawals);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData(1);
  }, []);

  const handleCancelWithdrawal = async (withdrawalId) => {
    if (!window.confirm('Are you sure you want to cancel this withdrawal? VEs will be refunded immediately.')) {
      return;
    }

    try {
      setCancellingId(withdrawalId);
      setActionMessage(null);
      const res = await client.post(`/withdrawals/${withdrawalId}/cancel`);
      setActionMessage({ type: 'success', text: res.data.message });
      // Refresh wallet & transactions immediately
      await fetchWalletData(pagination.page);
    } catch (err) {
      setActionMessage({
        type: 'danger',
        text: err.response?.data?.message || 'Failed to cancel withdrawal.'
      });
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-success';
      case 'PENDING':
        return 'bg-warning text-dark';
      case 'PROCESSING':
        return 'bg-info text-dark';
      case 'REJECTED':
        return 'bg-danger';
      case 'CANCELLED':
        return 'bg-secondary';
      default:
        return 'bg-dark';
    }
  };

  return (
    <div className="container py-4">
      {/* Header & Quick Action */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Rewards Wallet</h2>
          <p className="text-muted small mb-0">
            Real-time balance tracked through double-entry immutable ledger
          </p>
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary"
            onClick={() => fetchWalletData(pagination.page)}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <button
            className="btn btn-primary fw-semibold px-4 shadow-sm"
            onClick={() => navigate('/payout')}
          >
            Withdraw / Redeem VEs →
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className={`alert alert-${actionMessage.type} alert-dismissible fade show`} role="alert">
          {actionMessage.text}
          <button type="button" className="btn-close" onClick={() => setActionMessage(null)}></button>
        </div>
      )}

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {/* Five Authentic VELoop Currencies Only: VEs, SVEs, Gems, Tokens, Spins */}
      <div className="row g-3 mb-4">
        {/* Primary Currency: VEs */}
        <div className="col-12 col-md-4">
          <div className="card shadow-sm border-primary h-100 bg-primary-subtle">
            <div className="card-body">
              <div className="text-primary fw-bold text-uppercase small">Redeemable Currency</div>
              <h2 className="display-6 fw-bold my-2 text-primary">
                {wallet ? wallet.ves.toLocaleString() : '...'} <span className="fs-5">VEs</span>
              </h2>
              <div className="text-muted small">
                {summary?.pendingWithdrawals?.count > 0 ? (
                  <span className="text-warning-emphasis fw-semibold">
                    ⏳ {summary.pendingWithdrawals.count} pending ({summary.pendingWithdrawals.totalVes.toLocaleString()} VEs in review)
                  </span>
                ) : (
                  'No pending redemption requests'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Currencies */}
        <div className="col-6 col-md-2">
          <div className="card shadow-sm h-100 border-0 bg-white">
            <div className="card-body text-center">
              <div className="text-muted small fw-semibold">SVEs</div>
              <h3 className="fw-bold my-1 text-dark">
                {wallet ? wallet.sves.toLocaleString() : '0'}
              </h3>
              <span className="badge bg-secondary-subtle text-secondary small">Super VEs</span>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-2">
          <div className="card shadow-sm h-100 border-0 bg-white">
            <div className="card-body text-center">
              <div className="text-muted small fw-semibold">Gems 💎</div>
              <h3 className="fw-bold my-1 text-info">
                {wallet ? wallet.gems.toLocaleString() : '0'}
              </h3>
              <span className="badge bg-info-subtle text-info small">In-App Gems</span>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-2">
          <div className="card shadow-sm h-100 border-0 bg-white">
            <div className="card-body text-center">
              <div className="text-muted small fw-semibold">Tokens 🪙</div>
              <h3 className="fw-bold my-1 text-warning">
                {wallet ? wallet.tokens.toLocaleString() : '0'}
              </h3>
              <span className="badge bg-warning-subtle text-warning small">Game Tokens</span>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-2">
          <div className="card shadow-sm h-100 border-0 bg-white">
            <div className="card-body text-center">
              <div className="text-muted small fw-semibold">Spins 🎡</div>
              <h3 className="fw-bold my-1 text-success">
                {wallet ? wallet.spins.toLocaleString() : '0'}
              </h3>
              <span className="badge bg-success-subtle text-success small">Daily Spins</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Withdrawals Section */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
          <h5 className="fw-bold mb-0">Recent Redemptions & Payout Requests</h5>
          <span className="badge bg-light text-dark border">
            {withdrawals.length} Total Requests
          </span>
        </div>
        <div className="card-body p-0">
          {withdrawals.length === 0 ? (
            <div className="p-4 text-center text-muted small">
              No redemption requests submitted yet. Click "Withdraw / Redeem" above to submit one.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light small">
                  <tr>
                    <th>Requested At</th>
                    <th>Method</th>
                    <th>Payout Amount</th>
                    <th>VEs Deducted</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.withdrawalId}>
                      <td className="small text-muted">
                        {new Date(w.requestedAt).toLocaleString()}
                      </td>
                      <td>
                        <span className="fw-semibold text-capitalize">{w.method.replace(/_/g, ' ')}</span>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          ID: {w.withdrawalId.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="fw-bold text-success">
                        INR {w.payoutAmount?.toLocaleString()}
                      </td>
                      <td className="fw-semibold text-danger">
                        -{w.currencyAmount?.toLocaleString()} VEs
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(w.status)}`}>
                          {w.status}
                        </span>
                        {w.rejectionReason && (
                          <div className="text-danger small mt-1" style={{ fontSize: '0.75rem' }}>
                            Reason: {w.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {w.status === 'PENDING' && (
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleCancelWithdrawal(w.withdrawalId)}
                            disabled={cancellingId === w.withdrawalId}
                          >
                            {cancellingId === w.withdrawalId ? 'Cancelling...' : 'Cancel & Refund'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Immutable Transaction Ledger */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
          <h5 className="fw-bold mb-0">Ledger Transaction History</h5>
          <span className="text-muted small">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
          </span>
        </div>
        <div className="card-body p-0">
          {transactions.length === 0 ? (
            <div className="p-4 text-center text-muted small">No transactions found.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light small">
                  <tr>
                    <th>Date & Time</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Amount</th>
                    <th>Balance (Before → After)</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isCredit = tx.type === 'CREDIT';
                    return (
                      <tr key={tx.transactionId}>
                        <td className="small text-muted">
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isCredit ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="small fw-semibold">{tx.source}</td>
                        <td className={`fw-bold ${isCredit ? 'text-success' : 'text-danger'}`}>
                          {isCredit ? '+' : '-'}{tx.amount.toLocaleString()} {tx.currency}
                        </td>
                        <td className="small text-muted">
                          {tx.balanceBefore?.toLocaleString()} → {tx.balanceAfter?.toLocaleString()}
                        </td>
                        <td className="small">{tx.description || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="card-footer bg-white d-flex justify-content-between align-items-center py-2">
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={pagination.page <= 1 || loading}
              onClick={() => fetchWalletData(pagination.page - 1)}
            >
              ← Previous
            </button>
            <span className="small text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => fetchWalletData(pagination.page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* DevTools Tamper Box (Dev Mode Only) */}
      <DevToolsBox />
    </div>
  );
}
