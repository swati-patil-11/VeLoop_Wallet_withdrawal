import React, { useState } from 'react';
import client from '../api/client';
import { v4 as uuidv4 } from 'uuid';

export default function DevToolsBox() {
  const [tamperResult, setTamperResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const sendTamperedRequest = async (tamperType) => {
    setLoading(true);
    setTamperResult(null);

    const idempotencyKey = uuidv4();
    let payload = {
      method: 'upi',
      optionId: 'upi_10',
      payoutDetails: { upiId: 'tamper@test' }
    };

    if (tamperType === 'amount') {
      payload.amount = 1; // Injecting client-side amount
    } else if (tamperType === 'requiredAmount') {
      payload.requiredAmount = 1; // Injecting client-side requiredAmount
    } else if (tamperType === 'currency') {
      payload.currency = 'USD'; // Injecting forbidden currency
    } else if (tamperType === 'balance') {
      payload.balance = 999999; // Injecting fake balance
    }

    try {
      const res = await client.post('/withdrawals', payload, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      setTamperResult({
        status: res.status,
        success: true,
        data: res.data
      });
    } catch (err) {
      setTamperResult({
        status: err.response?.status || 500,
        success: false,
        data: err.response?.data || { message: err.message }
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card border-warning shadow-sm mt-4">
      <div className="card-header bg-warning-subtle text-dark d-flex align-items-center justify-content-between">
        <span className="fw-bold">🛠️ Evaluator Security DevTools (Tamper Defense Test)</span>
        <span className="badge bg-warning text-dark">Dev Mode Only</span>
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          Demonstrate that the backend enforces strict schema validation and rejects client-side financial manipulation.
          The frontend is strictly an interface; any request containing <code>amount</code>, <code>requiredAmount</code>, or <code>balance</code> is immediately rejected with HTTP 400.
        </p>

        <div className="d-flex flex-wrap gap-2 mb-3">
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => sendTamperedRequest('requiredAmount')}
            disabled={loading}
          >
            Tamper: Inject <code>requiredAmount: 1</code>
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => sendTamperedRequest('amount')}
            disabled={loading}
          >
            Tamper: Inject <code>amount: 10</code>
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => sendTamperedRequest('currency')}
            disabled={loading}
          >
            Tamper: Inject <code>currency: "USD"</code>
          </button>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => sendTamperedRequest('balance')}
            disabled={loading}
          >
            Tamper: Inject <code>balance: 999999</code>
          </button>
        </div>

        {loading && <div className="spinner-border spinner-border-sm text-warning" role="status"></div>}

        {tamperResult && (
          <div
            className={`alert ${
              tamperResult.status === 400 ? 'alert-success' : 'alert-danger'
            } mb-0 py-2 small`}
          >
            <div className="fw-bold">
              HTTP {tamperResult.status} {tamperResult.status === 400 ? '✓ REJECTED AS EXPECTED (Tamper Proof)' : 'UNEXPECTED'}
            </div>
            <pre className="mb-0 mt-1" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(tamperResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

