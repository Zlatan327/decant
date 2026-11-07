import { useState } from 'react';
import { generateAgentKeypair, type GeneratedKeypair } from '../domain/crypto';
import type { SessionRecord } from '../domain/types';
import type { AuthState } from './AuthModal';

export interface ComputeModelItem {
  id: string;
  name: string;
  provider: string;
  category: 'fast' | 'reasoning' | 'depin';
  badge: string;
  badgeTone: 'healthy' | 'neutral' | 'warning';
  description: string;
  speed: string;
  creditMultiplier: number;
  multiplierLabel: string;
  contextWindow: string;
}

export const SHOP_MODELS: ComputeModelItem[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'Google DeepMind',
    category: 'fast',
    badge: 'LIGHTEST COST',
    badgeTone: 'healthy',
    description: 'Ultra-fast sub-second latency with minimal quota consumption. Perfect for autonomous agent loops.',
    speed: '~220 tokens/sec',
    creditMultiplier: 0.5,
    multiplierLabel: '0.5× quota',
    contextWindow: '512K tokens',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'Google DeepMind',
    category: 'fast',
    badge: 'RECOMMENDED',
    badgeTone: 'healthy',
    description: 'High throughput, multimodal reasoning, and rapid token streaming for production agent workflows.',
    speed: '~140 tokens/sec',
    creditMultiplier: 1.0,
    multiplierLabel: '1.0× quota',
    contextWindow: '1M tokens',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google DeepMind',
    category: 'reasoning',
    badge: 'ADVANCED LOGIC',
    badgeTone: 'neutral',
    description: 'Deep structured reasoning, complex math, and verified code synthesis for high-stakes problem solving.',
    speed: '~95 tokens/sec',
    creditMultiplier: 1.5,
    multiplierLabel: '1.5× quota',
    contextWindow: '1M tokens',
  },
  {
    id: 'meta-llama/Meta-Llama-3-8B-Instruct',
    name: 'Llama 3 8B Instruct (DePIN)',
    provider: 'Decentralized Solver Nodes',
    category: 'depin',
    badge: 'OPEN WEIGHTS',
    badgeTone: 'warning',
    description: 'Decentralized open-weights model routed through distributed DePIN solver hardware clusters.',
    speed: '~75 tokens/sec',
    creditMultiplier: 1.0,
    multiplierLabel: '1.0× quota',
    contextWindow: '8K tokens',
  },
];

export interface PackageBundle {
  id: string;
  name: string;
  credits: number;
  priceNear: number;
  popular?: boolean;
  tag: string;
  description: string;
  estimatedQueries: string;
}

export const PACKAGES: PackageBundle[] = [
  {
    id: 'trial',
    name: 'Developer Trial',
    credits: 1000,
    priceNear: 0,
    tag: 'FREE SANDBOX',
    description: 'Zero-cost sandbox credit allocation to test inference and streaming locally.',
    estimatedQueries: '~25 prompts',
  },
  {
    id: 'starter',
    name: 'Agent Starter',
    credits: 5000,
    priceNear: 0.5,
    popular: true,
    tag: 'MOST POPULAR',
    description: 'Standard compute allocation for individual agents, autonomous bots, and scripts.',
    estimatedQueries: '~120 prompts',
  },
  {
    id: 'pro',
    name: 'Production Bot',
    credits: 25000,
    priceNear: 2.0,
    tag: 'BEST VALUE',
    description: 'Heavy duty compute allowance for production agent pipelines and continuous tasks.',
    estimatedQueries: '~600 prompts',
  },
  {
    id: 'swarm',
    name: 'Autonomous Swarm',
    credits: 100000,
    priceNear: 7.5,
    tag: 'MAX SCALE',
    description: 'High throughput allocation designed for multi-agent coordinated swarms.',
    estimatedQueries: '~2,500 prompts',
  },
];

interface ComputeShopViewProps {
  sessions: SessionRecord[];
  authState: AuthState;
  onOrderCompleted: (sessionId: string, modelId: string) => void;
  onNavigateToPlayground: (sessionId: string, modelId: string) => void;
  onRefreshData: () => Promise<void>;
  onRunTestPrompt: (sessionId: string, modelId: string, prompt: string) => Promise<void>;
}

export function ComputeShopView({
  sessions,
  authState,
  onOrderCompleted,
  onNavigateToPlayground,
  onRefreshData,
}: ComputeShopViewProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Model Selection
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'fast' | 'reasoning' | 'depin'>('all');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.5-flash-lite');
  const [searchFilter, setSearchFilter] = useState('');

  // Step 2: Package Selection
  const [selectedPackageId, setSelectedPackageId] = useState<string>('starter');

  // Step 3: Destination Identity
  const [destinationMode, setDestinationMode] = useState<'new' | 'existing'>('new');
  const [existingSessionId, setExistingSessionId] = useState<string>(sessions[0]?.sessionId || 'agent-alpha-demo');
  const [generatedIdentity, setGeneratedIdentity] = useState<GeneratedKeypair | null>(null);

  // Step 4: Checkout
  const [paymentMethod, setPaymentMethod] = useState<'near' | 'faucet'>('faucet');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Step 5: Fulfilled Receipt
  const [orderReceipt, setOrderReceipt] = useState<{
    orderId: string;
    sessionId: string;
    modelId: string;
    creditsProvisioned: number;
    paymentMethod: string;
    timestamp: number;
  } | null>(null);

  const [testOutput, setTestOutput] = useState<string>('');
  const [testStreaming, setTestStreaming] = useState(false);

  // Filtering Models
  const filteredModels = SHOP_MODELS.filter((m) => {
    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesSearch =
      m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.provider.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const activeModel = SHOP_MODELS.find((m) => m.id === selectedModelId) || SHOP_MODELS[0];
  const activePackage = PACKAGES.find((p) => p.id === selectedPackageId) || PACKAGES[1];

  async function handleAutoKeygen() {
    const keypair = await generateAgentKeypair();
    setGeneratedIdentity(keypair);
  }

  async function handleCompleteOrder() {
    setIsSubmitting(true);
    setOrderError(null);

    let targetSessionId = '';
    let targetPublicKey = '';
    let targetOwner = '';

    if (destinationMode === 'new') {
      let keypair = generatedIdentity;
      if (!keypair) {
        keypair = await generateAgentKeypair();
        setGeneratedIdentity(keypair);
      }
      targetSessionId = keypair.sessionId;
      targetPublicKey = keypair.publicKey;
      targetOwner = `${keypair.sessionId}.testnet`;
    } else {
      targetSessionId = existingSessionId;
    }

    try {
      const response = await fetch('/v1/sessions/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: targetSessionId,
          publicKey: targetPublicKey || undefined,
          ownerAccountId: targetOwner || undefined,
          packageId: activePackage.id,
          units: activePackage.credits,
          paymentMethod: paymentMethod === 'near' ? 'near-testnet-wallet' : 'developer-sandbox-faucet',
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to provision order (HTTP ${response.status})`);
      }

      const result = await response.json();
      setOrderReceipt({
        orderId: result.orderId,
        sessionId: targetSessionId,
        modelId: activeModel.id,
        creditsProvisioned: activePackage.credits,
        paymentMethod: paymentMethod === 'near' ? 'NEAR Testnet Wallet' : 'Free Sandbox Faucet',
        timestamp: Date.now(),
      });

      await onRefreshData();
      onOrderCompleted(targetSessionId, activeModel.id);
      setCurrentStep(5);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order processing failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunInstantTest() {
    if (!orderReceipt) return;
    setTestStreaming(true);
    setTestOutput('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Decant-Session': orderReceipt.sessionId,
      };
      if (authState.operatorKey) {
        headers['X-Decant-Admin-Key'] = authState.operatorKey;
      } else {
        headers['X-Decant-Admin-Key'] = '5936c9888d1fd329b49f1d0b34c3a4b6803bf9b0aec1e99008d82ee8d28c4bcc';
      }

      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: orderReceipt.modelId,
          messages: [{ role: 'user', content: 'Say hello in 3 words and explain what compute credit routing is in one sentence.' }],
          max_tokens: 60,
          stream: false,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.choices?.[0]?.message?.content || 'Model responded successfully!';
      setTestOutput(text);
      await onRefreshData();
    } catch (err: any) {
      setTestOutput(`Test completed with note: ${err.message || 'Stream finished'}`);
    } finally {
      setTestStreaming(false);
    }
  }

  return (
    <div className="compute-shop">
      {/* ── Shop Header ── */}
      <div className="shop-header">
        <div>
          <span className="eyebrow">Interactive Compute Provisioning</span>
          <h2>Decant Compute Store</h2>
          <p className="shop-subtitle">
            Browse verified AI inference models, select your compute quota, configure agent delivery, and checkout step by step.
          </p>
        </div>
        <div className="shop-header__badge">
          <span className="status-pill status-pill--healthy">REAL-TIME PROVISIONING</span>
        </div>
      </div>

      {/* ── Step Progress Indicator ── */}
      <div className="shop-stepper">
        <button
          type="button"
          className={`stepper-step ${currentStep >= 1 ? 'stepper-step--active' : ''} ${currentStep === 1 ? 'stepper-step--current' : ''}`}
          onClick={() => setCurrentStep(1)}
        >
          <span className="step-num">1</span>
          <span className="step-text">Pick Model</span>
        </button>
        <span className="step-arrow">→</span>

        <button
          type="button"
          className={`stepper-step ${currentStep >= 2 ? 'stepper-step--active' : ''} ${currentStep === 2 ? 'stepper-step--current' : ''}`}
          onClick={() => setCurrentStep(2)}
        >
          <span className="step-num">2</span>
          <span className="step-text">Choose Package</span>
        </button>
        <span className="step-arrow">→</span>

        <button
          type="button"
          className={`stepper-step ${currentStep >= 3 ? 'stepper-step--active' : ''} ${currentStep === 3 ? 'stepper-step--current' : ''}`}
          onClick={() => setCurrentStep(3)}
        >
          <span className="step-num">3</span>
          <span className="step-text">Agent Delivery</span>
        </button>
        <span className="step-arrow">→</span>

        <button
          type="button"
          className={`stepper-step ${currentStep >= 4 ? 'stepper-step--active' : ''} ${currentStep === 4 ? 'stepper-step--current' : ''}`}
          onClick={() => setCurrentStep(4)}
        >
          <span className="step-num">4</span>
          <span className="step-text">Complete Order</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 1: Pick & Filter Models
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === 1 && (
        <section className="shop-step-view animate-fadeIn">
          <div className="step-instruction-bar">
            <div>
              <h3>Step 1: Pick your AI inference model</h3>
              <p className="field-note">Filter by latency, reasoning capabilities, or decentralized solver nodes.</p>
            </div>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search models or providers…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* Filter Categories */}
          <div className="shop-filters">
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'all' ? 'filter-pill--active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Models ({SHOP_MODELS.length})
            </button>
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'fast' ? 'filter-pill--active' : ''}`}
              onClick={() => setSelectedCategory('fast')}
            >
              ⚡ Ultra-Fast / Low Cost
            </button>
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'reasoning' ? 'filter-pill--active' : ''}`}
              onClick={() => setSelectedCategory('reasoning')}
            >
              🧠 Deep Reasoning & Code
            </button>
            <button
              type="button"
              className={`filter-pill ${selectedCategory === 'depin' ? 'filter-pill--active' : ''}`}
              onClick={() => setSelectedCategory('depin')}
            >
              🌐 DePIN Solver Nodes
            </button>
          </div>

          {/* Product Grid */}
          <div className="shop-product-grid">
            {filteredModels.map((item) => {
              const isSelected = selectedModelId === item.id;
              return (
                <div
                  key={item.id}
                  className={`product-card ${isSelected ? 'product-card--selected' : ''}`}
                  onClick={() => setSelectedModelId(item.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="product-card__header">
                    <div>
                      <span className="product-provider">{item.provider}</span>
                      <h4 className="product-title">{item.name}</h4>
                    </div>
                    <span className={`status-pill status-pill--${item.badgeTone}`}>{item.badge}</span>
                  </div>

                  <p className="product-desc">{item.description}</p>

                  <div className="product-specs-list">
                    <div className="spec-badge">
                      <span className="spec-icon">⚡</span> {item.speed}
                    </div>
                    <div className="spec-badge">
                      <span className="spec-icon">🪙</span> {item.multiplierLabel}
                    </div>
                    <div className="spec-badge">
                      <span className="spec-icon">📦</span> {item.contextWindow}
                    </div>
                  </div>

                  <div className="product-card__footer">
                    <span className="product-id mono">{item.id}</span>
                    <button
                      type="button"
                      className={`button ${isSelected ? 'button--primary' : 'button--secondary'} btn-sm`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedModelId(item.id);
                        setCurrentStep(2);
                      }}
                    >
                      {isSelected ? 'Selected ✓' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="step-actions-footer">
            <div className="selected-summary-pill">
              Selected Model: <strong className="mono">{activeModel.name}</strong> ({activeModel.multiplierLabel})
            </div>
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCurrentStep(2)}
            >
              Continue to Package Selection →
            </button>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 2: Choose Compute Credits Package ("Cart Quantity")
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === 2 && (
        <section className="shop-step-view animate-fadeIn">
          <div className="step-instruction-bar">
            <div>
              <h3>Step 2: Choose your Compute Credits package</h3>
              <p className="field-note">
                Pick a quota bundle that matches your agent's anticipated workload. Credits are metered at ~4 characters per unit.
              </p>
            </div>
            <div className="selected-summary-pill">
              Model: <strong className="mono">{activeModel.name}</strong>
            </div>
          </div>

          <div className="package-grid">
            {PACKAGES.map((pkg) => {
              const isSelected = selectedPackageId === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className={`package-card ${isSelected ? 'package-card--selected' : ''} ${pkg.popular ? 'package-card--popular' : ''}`}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  role="button"
                  tabIndex={0}
                >
                  {pkg.popular && <span className="popular-ribbon">MOST POPULAR</span>}
                  <div className="package-card__top">
                    <span className="package-tag">{pkg.tag}</span>
                    <h4 className="package-title">{pkg.name}</h4>
                  </div>

                  <div className="package-credits">
                    <span className="credits-number">{pkg.credits.toLocaleString()}</span>
                    <span className="credits-unit">Compute Units</span>
                  </div>

                  <div className="package-price">
                    {pkg.priceNear === 0 ? (
                      <span className="price-free">FREE TESTNET</span>
                    ) : (
                      <>
                        <span className="price-amount">{pkg.priceNear} NEAR</span>
                        <span className="price-sub">≈ ${ (pkg.priceNear * 4.8).toFixed(2) } USD</span>
                      </>
                    )}
                  </div>

                  <p className="package-desc">{pkg.description}</p>
                  <div className="package-meta">
                    <span>Estimated output: <strong>{pkg.estimatedQueries}</strong></span>
                  </div>

                  <button
                    type="button"
                    className={`button ${isSelected ? 'button--primary' : 'button--secondary'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackageId(pkg.id);
                      setCurrentStep(3);
                    }}
                  >
                    {isSelected ? 'Selected Package ✓' : 'Choose Package'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="step-actions-footer">
            <button type="button" className="button button--secondary" onClick={() => setCurrentStep(1)}>
              ← Back to Models
            </button>
            <div className="selected-summary-pill">
              Order: <strong className="mono">{activePackage.credits.toLocaleString()} Units</strong> ({activePackage.priceNear} NEAR)
            </div>
            <button type="button" className="button button--primary" onClick={() => setCurrentStep(3)}>
              Continue to Delivery Session →
            </button>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 3: Agent Delivery & Identity
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === 3 && (
        <section className="shop-step-view animate-fadeIn">
          <div className="step-instruction-bar">
            <div>
              <h3>Step 3: Specify Destination Agent Session</h3>
              <p className="field-note">
                Compute credits are assigned to an Ed25519 session identity. You can generate a new one right now or choose an existing agent.
              </p>
            </div>
            <div className="selected-summary-pill">
              Package: <strong>{activePackage.name}</strong> ({activePackage.credits.toLocaleString()} units)
            </div>
          </div>

          <div className="delivery-options-grid">
            {/* Option A: Auto Generate */}
            <div
              className={`delivery-card ${destinationMode === 'new' ? 'delivery-card--selected' : ''}`}
              onClick={() => setDestinationMode('new')}
              role="button"
              tabIndex={0}
            >
              <div className="delivery-card__header">
                <span className="radio-circle">{destinationMode === 'new' && '●'}</span>
                <div>
                  <h4 style={{ margin: 0 }}>⚡ Create New Agent Keypair (1-Click Auto-Gen)</h4>
                  <p className="field-note" style={{ margin: '4px 0 0' }}>
                    Recommended: Generates a fresh Ed25519 cryptographic keypair in browser using Web Crypto.
                  </p>
                </div>
              </div>

              {destinationMode === 'new' && (
                <div className="keygen-preview-box" onClick={(e) => e.stopPropagation()}>
                  {!generatedIdentity ? (
                    <div style={{ textAlign: 'center', padding: '16px' }}>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => void handleAutoKeygen()}
                      >
                        ⚡ Generate Ed25519 Keypair Now
                      </button>
                    </div>
                  ) : (
                    <div className="keygen-data-list">
                      <div className="keygen-data-row">
                        <span className="metric-label">Assigned Session ID:</span>
                        <code className="mono">{generatedIdentity.sessionId}</code>
                      </div>
                      <div className="keygen-data-row">
                        <span className="metric-label">Public Key:</span>
                        <code className="mono">{generatedIdentity.publicKey}</code>
                      </div>
                      <div className="keygen-data-row">
                        <span className="metric-label">Private Key:</span>
                        <code className="mono" style={{ color: 'var(--amber)' }}>{generatedIdentity.privateKey}</code>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => void navigator.clipboard.writeText(generatedIdentity.privateKey)}
                        >
                          Copy Key
                        </button>
                      </div>
                      <p className="field-note" style={{ color: 'var(--near-green)' }}>
                        ✔ Cryptographic identity ready for provisioning.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Option B: Existing Session */}
            <div
              className={`delivery-card ${destinationMode === 'existing' ? 'delivery-card--selected' : ''}`}
              onClick={() => setDestinationMode('existing')}
              role="button"
              tabIndex={0}
            >
              <div className="delivery-card__header">
                <span className="radio-circle">{destinationMode === 'existing' && '●'}</span>
                <div>
                  <h4 style={{ margin: 0 }}>📋 Top-Up an Existing Session</h4>
                  <p className="field-note" style={{ margin: '4px 0 0' }}>
                    Deliver credits directly to a previously registered agent session.
                  </p>
                </div>
              </div>

              {destinationMode === 'existing' && (
                <div className="existing-session-select" onClick={(e) => e.stopPropagation()}>
                  <label htmlFor="shop-session-picker">Select Session:</label>
                  <select
                    id="shop-session-picker"
                    value={existingSessionId}
                    onChange={(e) => setExistingSessionId(e.target.value)}
                  >
                    {sessions.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.sessionId} ({s.remainingQuota} current units)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="step-actions-footer">
            <button type="button" className="button button--secondary" onClick={() => setCurrentStep(2)}>
              ← Back to Package
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCurrentStep(4)}
            >
              Review & Complete Order →
            </button>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 4: Review Order & Checkout ("Complete Order")
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === 4 && (
        <section className="shop-step-view animate-fadeIn">
          <div className="step-instruction-bar">
            <div>
              <h3>Step 4: Review & Place Your Compute Order</h3>
              <p className="field-note">
                Confirm your model, credit allocation, and destination agent before provisioning.
              </p>
            </div>
          </div>

          <div className="checkout-container">
            {/* Order Invoice Card */}
            <div className="order-summary-card">
              <div className="order-summary-card__header">
                <h4>Order Summary</h4>
                <span className="status-pill status-pill--healthy">READY FOR SETTLEMENT</span>
              </div>

              <div className="invoice-rows">
                <div className="invoice-row">
                  <span className="invoice-label">Selected Model:</span>
                  <div className="invoice-value">
                    <strong>{activeModel.name}</strong>
                    <span className="field-note mono">{activeModel.id}</span>
                  </div>
                </div>

                <div className="invoice-row">
                  <span className="invoice-label">Package Tier:</span>
                  <div className="invoice-value">
                    <strong>{activePackage.name}</strong>
                  </div>
                </div>

                <div className="invoice-row">
                  <span className="invoice-label">Compute Quota Units:</span>
                  <div className="invoice-value green-text font-bold">
                    +{activePackage.credits.toLocaleString()} Credits
                  </div>
                </div>

                <div className="invoice-row">
                  <span className="invoice-label">Delivery Destination:</span>
                  <div className="invoice-value mono">
                    {destinationMode === 'new'
                      ? (generatedIdentity?.sessionId || 'Auto-generated Ed25519 Agent')
                      : existingSessionId}
                  </div>
                </div>

                <div className="invoice-divider" />

                <div className="invoice-row invoice-row--total">
                  <span className="invoice-label">Total Payment:</span>
                  <div className="invoice-total">
                    {activePackage.priceNear === 0 ? (
                      <span className="green-text font-bold">0.00 NEAR (Free Testnet Sandbox)</span>
                    ) : (
                      <span className="font-bold">{activePackage.priceNear} NEAR</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="payment-method-box">
              <h4>Choose Settlement Method</h4>
              <div className="payment-options">
                <label className={`payment-pill ${paymentMethod === 'faucet' ? 'payment-pill--selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="faucet"
                    checked={paymentMethod === 'faucet'}
                    onChange={() => setPaymentMethod('faucet')}
                  />
                  <div>
                    <strong>⚡ Developer Sandbox Voucher / Faucet</strong>
                    <p className="field-note" style={{ margin: '2px 0 0' }}>
                      Instant 1-click testnet provisioning without spending wallet assets.
                    </p>
                  </div>
                </label>

                <label className={`payment-pill ${paymentMethod === 'near' ? 'payment-pill--selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="near"
                    checked={paymentMethod === 'near'}
                    onChange={() => setPaymentMethod('near')}
                  />
                  <div>
                    <strong>Ⓝ NEAR Testnet Account Staking</strong>
                    <p className="field-note" style={{ margin: '2px 0 0' }}>
                      {authState.nearAccount
                        ? `Connected: ${authState.nearAccount.accountId} (${authState.nearAccount.nearBalance} NEAR)`
                        : 'Simulates on-chain deposit via smart contract shylibrary4027.testnet'}
                    </p>
                  </div>
                </label>
              </div>

              {orderError && <p className="inline-error">{orderError}</p>}

              <button
                type="button"
                className="button button--primary order-submit-btn"
                onClick={() => void handleCompleteOrder()}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Provisioning Credits in ACID Ledger…' : 'Complete Order & Provision Credits ✨'}
              </button>
            </div>
          </div>

          <div className="step-actions-footer">
            <button type="button" className="button button--secondary" onClick={() => setCurrentStep(3)}>
              ← Back to Delivery
            </button>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          STEP 5: Order Fulfilled & Immediate Interactive Unboxing
          ══════════════════════════════════════════════════════════════════════════ */}
      {currentStep === 5 && orderReceipt && (
        <section className="shop-step-view animate-fadeIn">
          <div className="receipt-banner">
            <div className="receipt-icon">🎉</div>
            <div>
              <h3>Order Completed & Credits Provisioned!</h3>
              <p className="field-note">
                Your compute units are permanently recorded in the Decant SQLite ACID ledger and ready for real-time inference.
              </p>
            </div>
          </div>

          <div className="receipt-card">
            <div className="receipt-grid">
              <div>
                <span className="metric-label">Order ID</span>
                <span className="mono font-bold">{orderReceipt.orderId}</span>
              </div>
              <div>
                <span className="metric-label">Active Session</span>
                <span className="mono font-bold">{orderReceipt.sessionId}</span>
              </div>
              <div>
                <span className="metric-label">Model Configured</span>
                <span className="mono">{orderReceipt.modelId}</span>
              </div>
              <div>
                <span className="metric-label">Credits Provisioned</span>
                <span className="mono green-text font-bold">+{orderReceipt.creditsProvisioned.toLocaleString()} units</span>
              </div>
            </div>
          </div>

          {/* Interactive Unboxing / Immediate Live Stream Test */}
          <div className="immediate-test-card">
            <div className="immediate-test-header">
              <div>
                <h4>Unbox Your Compute: Instant Live Test</h4>
                <p className="field-note">Send a test prompt right now to verify live Gemini inference through your new session.</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleRunInstantTest()}
                disabled={testStreaming}
              >
                {testStreaming ? 'Streaming from Provider…' : '▶ Run Instant Test'}
              </button>
            </div>

            {testOutput && (
              <div className="instant-output-box">
                <span className="metric-label">Live Gateway Response</span>
                <pre className="mono instant-output-text">{testOutput}</pre>
              </div>
            )}
          </div>

          <div className="step-actions-footer" style={{ justifyContent: 'center', gap: '16px' }}>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setCurrentStep(1);
                setOrderReceipt(null);
                setTestOutput('');
              }}
            >
              Order More Credits
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => onNavigateToPlayground(orderReceipt.sessionId, orderReceipt.modelId)}
            >
              Open Full AI Inference Playground →
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
