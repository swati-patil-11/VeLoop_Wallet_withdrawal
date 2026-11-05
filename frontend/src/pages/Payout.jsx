import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { v4 as uuidv4 } from 'uuid';

export default function Payout() {
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [optionsData, setOptionsData] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [payoutDetails, setPayoutDetails] = useState({});
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const navigate = useNavigate();

  // Load available payout methods on mount
  useEffect(() => {
    async function loadMethods() {
      try {
        setLoadingMethods(true);
        setError(null);
        const res = await client.get('/payout/methods');
        setMethods(res.data.methods || []);
        if (res.data.methods?.length > 0) {
          // Default to first method (typically UPI)
          const first = res.data.methods[0].methodId;
          setSelectedMethod(first);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load payout methods.');
      } finally {
        setLoadingMethods(false);
      }
    }
    loadMethods();
  }, []);

  // When selectedMethod changes, fetch options from backend
  useEffect(() => {
    if (!selectedMethod) return;

    async function loadOptions() {
      try {
        setLoadingOptions(true);
        setError(null);
        setSelectedOption(null);
        setPayoutDetails({});
        const res = await client.get(`/payout/options/${selectedMethod}`);
        setOptionsData(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load options for this method.');
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, [selectedMethod]);

  const handleFieldChange = (field, value) => {
    setPayoutDetails((prev) => ({ ...prev, [field]: value }));
  };

  const handleOpenConfirm = (e) => {
    e.preventDefault();
    if (!selectedOption) {
      setError('Please select a payout denomination.');
      return;
    }

    // Basic local field check before modal
    const requiredFields = selectedOption.requiredFields || ['upiId'];
    for (const f of requiredFields) {
      if (!payoutDetails[f] || !payoutDetails[f].trim()) {
        setError(`Please enter your ${f}.`);
        return;
      }
    }

    setError(null);
    setShowConfirmModal(true);
  };

  const handleConfirmWithdrawal = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // Generate a fresh unique Idempotency-Key per confirm attempt
      const idempotencyKey = uuidv4();

      // MOST IMPORTANT RULE: Frontend sends ONLY identifiers and recipient details.
      // NEVER send amounts, balances, or required VEs!
      const payload = {
        method: selectedMethod,
        optionId: selectedOption.optionId,
        payoutDetails: payoutDetails
      };

      const res = await client.post('/withdrawals', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });

      setShowConfirmModal(false);
      // Navigate to /wallet with success alert
      navigate('/wallet');
    } catch (err) {
      setShowConfirmModal(false);
      // Display server error message as-is
      setError(err.response?.data?.message || 'Failed to process withdrawal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-8">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-white py-3">
              <div className="d-flex justify-content-between align-items-center">
                <h4 className="fw-bold mb-0">Redeem Rewards / Payout</h4>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => navigate('/wallet')}
                >
                  ← Back to Wallet
                </button>
              </div>
            </div>

            <div className="card-body p-4">
              {/* Current balance indicator */}
              <div className="alert alert-light border d-flex justify-content-between align-items-center mb-4">
                <div>
                  <span className="small text-muted d-block">Your Current Available Balance:</span>
                  <span className="fs-4 fw-bold text-primary">
                    {optionsData ? optionsData.userVes.toLocaleString() : '...'} VEs
                  </span>
                </div>
                <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                  Live Server Balance
                </span>
              </div>

              {error && <div className="alert alert-danger py-2">{error}</div>}

              {/* Step 1: Method Selection (Loaded dynamically from API) */}
              <div className="mb-4">
                <label className="form-label fw-bold small text-uppercase text-muted">
                  1. Select Payout Method
                </label>
                {loadingMethods ? (
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                ) : (
                  <div className="row g-2">
                    {methods.map((m) => {
                      const isSelected = selectedMethod === m.methodId;
                      return (
                        <div className="col-12 col-sm-6" key={m.methodId}>
                          <div
                            className={`card p-3 h-100 text-start cursor-pointer border ${
                              isSelected ? 'border-primary bg-primary-subtle' : 'bg-white'
                            }`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedMethod(m.methodId)}
                          >
                            <div className="fw-bold text-dark">{m.name}</div>
                            <div className="text-muted small mt-1">{m.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Option Selection (Dynamic with backend eligibility check) */}
              <div className="mb-4">
                <label className="form-label fw-bold small text-uppercase text-muted">
                  2. Choose Denomination
                </label>
                {loadingOptions ? (
                  <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                ) : (
                  <div className="row g-2">
                    {optionsData?.options?.map((opt) => {
                      const isSelected = selectedOption?.optionId === opt.optionId;
                      const isEligible = opt.eligible;

                      return (
                        <div className="col-6 col-sm-4 col-md-3" key={opt.optionId}>
                          <div
                            className={`card p-3 text-center h-100 border ${
                              !isEligible
                                ? 'opacity-50 bg-light'
                                : isSelected
                                ? 'border-primary bg-primary-subtle shadow-sm'
                                : 'bg-white'
                            }`}
                            style={{ cursor: isEligible ? 'pointer' : 'not-allowed' }}
                            onClick={() => isEligible && setSelectedOption(opt)}
                          >
                            <div className="fs-5 fw-bold text-success">
                              INR {opt.payoutValue.toLocaleString()}
                            </div>
                            <div className="text-primary small fw-semibold mt-1">
                              {opt.requiredAmount.toLocaleString()} VEs
                            </div>
                            {!isEligible && (
                              <div
                                className="text-danger small mt-2"
                                style={{ fontSize: '0.7rem', lineHeight: '1.2' }}
                              >
                                {opt.reason || 'Not eligible'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 3: Required Details Form (Fields from API) */}
              {selectedOption && (
                <form onSubmit={handleOpenConfirm}>
                  <div className="mb-4">
                    <label className="form-label fw-bold small text-uppercase text-muted">
                      3. Enter Payout Destination Details
                    </label>

                    <div className="card bg-light border-0 p-3">
                      {selectedOption.requiredFields?.map((fieldKey) => (
                        <div className="mb-2" key={fieldKey}>
                          <label className="form-label small fw-semibold">
                            {fieldKey === 'upiId'
                              ? 'UPI ID / VPA (e.g. yourname@okaxis, yourname@okhdfcbank)'
                              : fieldKey === 'email'
                              ? 'Delivery Email Address'
                              : fieldKey}
                          </label>
                          <input
                            type={fieldKey === 'email' ? 'email' : 'text'}
                            className="form-control"
                            placeholder={fieldKey === 'upiId' ? 'name@bank' : 'user@example.com'}
                            value={payoutDetails[fieldKey] || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submission Button */}
                  <button
                    type="submit"
                    className="btn btn-primary w-100 py-2 fw-semibold shadow-sm"
                    disabled={submitting}
                  >
                    Proceed to Confirm Redemption →
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedOption && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Confirm Reward Redemption</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={submitting}
                ></button>
              </div>
              <div className="modal-body py-4">
                <p className="text-muted mb-3">
                  Are you sure you want to redeem this reward? The required VEs will be deducted immediately from your wallet.
                </p>

                <div className="card bg-light border p-3 mb-3">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Payout Method:</span>
                    <span className="fw-semibold text-capitalize">
                      {selectedMethod.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Cash Payout:</span>
                    <span className="fw-bold text-success fs-5">
                      INR {selectedOption.payoutValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span className="text-muted">Required Units:</span>
                    <span className="fw-bold text-primary">
                      {selectedOption.requiredAmount.toLocaleString()} VEs
                    </span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-muted">Recipient Destination:</span>
                    <span className="fw-semibold text-dark">
                      {payoutDetails.upiId || payoutDetails.email || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="alert alert-info py-2 small mb-0">
                  ℹ️ Redemptions are reviewed and approved by administrators. If rejected or cancelled, your VEs are automatically restored.
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary fw-semibold"
                  onClick={handleConfirmWithdrawal}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Confirm Redemption'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
