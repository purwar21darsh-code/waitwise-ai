import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote,
  BarChart3, Bell, CalendarDays, Check, CircleHelp, Coins, CreditCard,
  ExternalLink, FileText, Home, Info, Laptop, LoaderCircle, LockKeyhole, Plus, RotateCcw,
  ShieldCheck, Sparkles, Target, Trash2, Wallet, X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BrowserProvider, Contract, formatEther, keccak256, parseEther, toUtf8Bytes } from 'ethers'
import type { Eip1193Provider } from 'ethers'
import { calculateDecision, calculateEmi, calculateSafetyScore, compareScenarios, formatINR, formatNumber, type DecisionResult, type EmiResult, type Purchase, type Scenario } from './lib/finance'
import { getGoalProjection, SAMPLE_PROFILE, type AppProfile, type PriceObservation, type SavingsGoal } from './lib/models'
import { ManualPriceProvider } from './lib/price-provider'

type View = 'welcome' | 'home' | 'decision' | 'simulator' | 'emi' | 'prices' | 'goals' | 'vault' | 'settings' | 'help'
type StoredTransaction = { hash: string; kind: string; blockNumber: number; at: string }
type ChainGoal = { id: bigint; target: bigint; balance: bigint; deadline: bigint; status: number; reference: string }

const STORE = { profile: 'waitwise.profile.v1', sample: 'waitwise.sample.v1', goals: 'waitwise.goals.v1', prices: 'waitwise.prices.v1' }
const TESTNET = {
  chainId: 10143,
  hexChainId: '0x279f',
  name: import.meta.env.VITE_NETWORK_NAME || 'Monad Testnet',
  rpc: import.meta.env.VITE_RPC_URL || 'https://testnet-rpc.monad.xyz',
  explorer: import.meta.env.VITE_EXPLORER_BASE_URL || 'https://testnet.monadvision.com',
  faucet: import.meta.env.VITE_FAUCET_URL || 'https://faucet.monad.xyz',
  contract: import.meta.env.VITE_VAULT_ADDRESS || '',
}
const VAULT_ABI = [
  'function totalGoals() view returns (uint256)',
  'function createGoal(uint256 targetAmount,uint64 deadline,bytes32 referenceHash) returns (uint256)',
  'function deposit(uint256 goalId) payable',
  'function cancelGoal(uint256 goalId)',
  'function withdraw(uint256 goalId,uint256 amount)',
  'function getGoal(uint256 goalId) view returns (tuple(address owner,uint256 targetAmount,uint256 balance,uint64 deadline,uint8 storedStatus,bytes32 referenceHash))',
  'function getStatus(uint256 goalId) view returns (uint8)',
  'function getOwnerGoalIds(address owner) view returns (uint256[])',
  'event GoalCreated(address indexed owner,uint256 indexed goalId,uint256 targetAmount,uint64 deadline,bytes32 referenceHash)',
  'event Deposited(address indexed owner,uint256 indexed goalId,uint256 amount,uint256 newBalance)',
  'event GoalCancelled(address indexed owner,uint256 indexed goalId)',
  'event Withdrawn(address indexed owner,uint256 indexed goalId,uint256 amount)',
]

declare global {
  interface Window { ethereum?: Eip1193Provider & { on?: (event: string, callback: (...args: unknown[]) => void) => void } }
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) as T : fallback
  } catch { return fallback }
}
function money(value: number) { return formatINR(value) }
function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}` }
function cx(...parts: Array<string | false | undefined>) { return parts.filter(Boolean).join(' ') }

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={cx('card', className)}>{children}</section>
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}
function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <label className={cx('field', className)}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}
function Metric({ label, value, icon: Icon, detail, tone = '' }: { label: string; value: string; icon: typeof Banknote; detail?: string; tone?: string }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><span className={cx('metric-icon', tone)}><Icon size={16} /></span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
}
function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? '#55c997' : score >= 50 ? '#e4b65a' : '#e17878'
  return <div className="score-ring" style={{ '--score': `${score * 3.6}deg`, '--score-color': color } as React.CSSProperties}><div className="score-ring-center"><strong>{score}</strong><small>/ 100</small></div></div>
}
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function WalletConnectionState({ address, wrongNetwork, error }: { address: string; wrongNetwork: boolean; error?: string }) {
  if (error) return <span className="wallet-state wallet-state-error"><AlertCircle size={13}/>{error}</span>
  if (!address) return <span className="wallet-state">Wallet not connected</span>
  if (wrongNetwork) return <span className="wallet-state wallet-state-warning"><AlertCircle size={13}/>Connected · switch to Monad Testnet</span>
  return <span className="wallet-state wallet-state-connected"><span className="online-dot"/>Connected · Monad Testnet</span>
}

export function TransactionStatus({ status, message, hash, explorer, onDismiss }: { status: 'submitted' | 'pending' | 'confirmed' | 'failed'; message: string; hash: string; explorer: string; onDismiss: () => void }) {
  return <Card className={cx('transaction-status-card', status === 'failed' && 'transaction-failed')}><div className="transaction-status-icon">{status === 'pending' || status === 'submitted' ? <LoaderCircle className="spin" size={19}/> : status === 'confirmed' ? <Check size={19}/> : <AlertCircle size={19}/>}</div><div><div className="eyebrow">TRANSACTION {status.toUpperCase()}</div><p>{message}</p>{hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={13}/></a>}</div><button className="icon-button" onClick={onDismiss} aria-label="Dismiss transaction status"><X size={16}/></button></Card>
}

export function PurchaseForm({ purchase, setPurchase, onSubmit, compact = false }: { purchase: Purchase; setPurchase: (next: Purchase) => void; onSubmit: (event: React.FormEvent) => void; compact?: boolean }) {
  return <form className={cx('purchase-form', compact && 'purchase-form-compact')} onSubmit={onSubmit}>
    <Field label="What are you thinking of buying?">
      <input aria-label="Product name" value={purchase.name} onChange={(event) => setPurchase({ ...purchase, name: event.target.value })} placeholder="e.g. Laptop for college" required maxLength={80} />
    </Field>
    <div className="form-row">
      <Field label="Category">
        <select aria-label="Product category" value={purchase.category} onChange={(event) => setPurchase({ ...purchase, category: event.target.value })}>
          {['Laptop', 'Phone', 'Tablet', 'Study equipment', 'Other'].map((category) => <option key={category}>{category}</option>)}
        </select>
      </Field>
      <Field label="Current price (₹)">
        <input aria-label="Product price" type="number" min="1" step="1" value={purchase.price || ''} onChange={(event) => setPurchase({ ...purchase, price: Number(event.target.value) })} required />
      </Field>
    </div>
    <div className="form-row">
      <Field label="How urgent is it?">
        <select aria-label="Purchase urgency" value={purchase.urgency} onChange={(event) => setPurchase({ ...purchase, urgency: event.target.value as Purchase['urgency'] })}>
          <option value="low">Can wait</option><option value="normal">Soon</option><option value="high">Need it soon</option>
        </select>
      </Field>
      <Field label="Planned date (optional)">
        <input aria-label="Planned purchase date" type="date" value={purchase.plannedDate || ''} onChange={(event) => setPurchase({ ...purchase, plannedDate: event.target.value })} />
      </Field>
    </div>
    <button className="button button-primary button-wide" type="submit"><Sparkles size={17} /> Check my timing <ArrowRight size={16} /></button>
  </form>
}

export function DecisionPanel({ result, purchase, onExplain, explaining, aiExplanation, aiUnavailable }: { result: DecisionResult; purchase: Purchase; onExplain: () => void; explaining: boolean; aiExplanation: string; aiUnavailable: boolean }) {
  const tone = result.recommendation === 'BUY NOW' ? 'green' : result.recommendation === 'WAIT' ? 'amber' : 'red'
  const risk = result.projectedShortfall ? 'HIGH' : result.cashAfterPurchaseAndObligations < result.reserveTarget ? 'MODERATE' : 'LOW'
  const riskTone = risk === 'LOW' ? 'green' : risk === 'MODERATE' ? 'amber' : 'red'
  return <div className="decision-layout">
    <Card className="decision-card">
      <div className="decision-card-top"><Badge tone={tone}>{result.recommendation}</Badge><span className="decision-for">for {purchase.name || 'your purchase'}</span></div>
      <h2>{result.reason}</h2>
      <div className="decision-meta"><span className="meta-icon"><ShieldCheck size={16} /></span><span><strong>Purchase risk: </strong><Badge tone={riskTone}>{risk}</Badge></span><span className="meta-divider" /> <span>Based on the numbers you entered</span></div>
      <div className="breakdown-grid">
        <div><small>Liquid savings</small><strong>{money(result.availableSavings)}</strong></div>
        <div><small>Purchase cost</small><strong>{money(result.purchaseCost)}</strong></div>
        <div><small>Near-term obligations</small><strong>{money(result.obligationsBeforeNextIncome)}</strong></div>
        <div><small>Cash left after purchase</small><strong className={result.cashAfterPurchaseAndObligations < result.reserveTarget ? 'text-amber' : 'text-green'}>{money(result.cashAfterPurchaseAndObligations)}</strong></div>
      </div>
      <div className="reserve-track-wrap"><div className="reserve-track-copy"><span>Emergency reserve target</span><strong>{money(result.reserveTarget)}</strong></div><div className="reserve-track"><span style={{ width: `${Math.min(100, result.reserveTarget > 0 ? Math.max(0, result.cashAfterPurchaseAndObligations / result.reserveTarget * 100) : 0)}%` }} /></div><small>{result.cashAfterPurchaseAndObligations >= result.reserveTarget ? 'Reserve target remains covered in this estimate.' : 'This purchase could bring cash below your reserve target.'}</small></div>
      <div className="result-actions"><button className="button button-secondary" type="button" onClick={onExplain} disabled={explaining}>{explaining ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} {explaining ? 'Getting explanation…' : 'Explain this result'}</button><span className="caption">The calculation is authoritative; AI only explains these figures.</span></div>
      {aiExplanation && <div className={cx('ai-explanation', aiUnavailable && 'ai-explanation-fallback')}><Sparkles size={16} /><div><strong>{aiUnavailable ? 'Deterministic explanation' : 'Plain-language explanation'}</strong><p>{aiExplanation}</p></div></div>}
      <div className="recommendation-columns">
        <div><div className="small-heading"><AlertCircle size={15} /> Watch-outs</div>{result.risks.length ? <ul>{result.risks.map((riskItem) => <li key={riskItem}>{riskItem}</li>)}</ul> : <p className="muted-copy">No immediate shortfall found from the information provided.</p>}</div>
        <div><div className="small-heading"><ArrowRight size={15} /> Options to consider</div><ul>{result.alternatives.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      {result.missing.length > 0 && <div className="data-warning"><Info size={16} /> Missing or incomplete: {result.missing.join(', ')}. The result is uncertain.</div>}
    </Card>
    <Card className="assumptions-card"><div className="card-heading"><div><div className="eyebrow">HOW THIS WAS CALCULATED</div><h3>The inputs behind your result</h3></div><div className="card-icon"><Activity size={18} /></div></div>
      <div className="calculation-line"><span>Monthly surplus after planned savings</span><strong className={result.monthlySurplus < 0 ? 'text-red' : ''}>{money(result.monthlySurplus)}</strong></div>
      <div className="calculation-line"><span>Amount needed to reach purchase + reserve</span><strong>{money(Math.max(0, purchase.price + result.reserveTarget + result.obligationsBeforeNextIncome - result.availableSavings))}</strong></div>
      <div className="calculation-line"><span>Estimated savings target date</span><strong>{result.savingsTargetDate ? new Date(`${result.savingsTargetDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not enough savings data'}</strong></div>
      <div className="divider" /><div className="small-heading"><Info size={15} /> Assumptions</div>
      <ul className="assumption-list">{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      <div className="disclaimer-box">Educational estimate only. It is not a credit assessment, lender offer, or guarantee of financial safety.</div>
    </Card>
  </div>
}

export default function App() {
  const [hasOnboarded, setHasOnboarded] = useState(() => readStored<boolean>('waitwise.onboarded.v1', false))
  const [view, setView] = useState<View>(() => readStored<boolean>('waitwise.onboarded.v1', false) ? 'home' : 'welcome')
  const [profile, setProfile] = useState<AppProfile>(() => readStored(STORE.profile, SAMPLE_PROFILE))
  const [isSample, setIsSample] = useState<boolean>(() => readStored(STORE.sample, true))
  const [goals, setGoals] = useState<SavingsGoal[]>(() => readStored(STORE.goals, []))
  const [observations, setObservations] = useState<PriceObservation[]>(() => readStored(STORE.prices, []))
  const [activeObservationProduct, setActiveObservationProduct] = useState<PriceObservation[]>([])
  const [purchase, setPurchase] = useState<Purchase>({ name: 'Laptop for college', category: 'Laptop', price: 58_000, urgency: 'normal', plannedDate: '' })
  const [toast, setToast] = useState('')
  const [aiExplanation, setAiExplanation] = useState('')
  const [aiUnavailable, setAiUnavailable] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [scenarioWait, setScenarioWait] = useState(30)
  const [scenarioContribution, setScenarioContribution] = useState(profile.monthlySavingsTarget)
  const [scenarioPrice, setScenarioPrice] = useState(purchase.price)
  const [scenarioAlternative, setScenarioAlternative] = useState(Math.round(purchase.price * 0.78))
  const [scenarioIncomeDelta, setScenarioIncomeDelta] = useState(0)
  const [scenarioUpcoming, setScenarioUpcoming] = useState(profile.upcomingExpenses)
  const [selectedDate, setSelectedDate] = useState('')
  const [emiRate, setEmiRate] = useState('')
  const [emiTenure, setEmiTenure] = useState('12')
  const [emiFee, setEmiFee] = useState('0')
  const [emiOtherFees, setEmiOtherFees] = useState('0')
  const [emiError, setEmiError] = useState('')
  const [goalForm, setGoalForm] = useState({ name: '', target: '', current: '0', contribution: '', date: '' })
  const [goalError, setGoalError] = useState('')
  const [priceForm, setPriceForm] = useState({ product: 'Laptop for college', price: '', date: new Date().toISOString().slice(0, 10), url: '' })
  const [priceTarget, setPriceTarget] = useState('')
  const [priceAlert, setPriceAlert] = useState(false)
  const [priceError, setPriceError] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletError, setWalletError] = useState('')
  const [walletBalance, setWalletBalance] = useState('')
  const [wrongNetwork, setWrongNetwork] = useState(false)
  const [chainGoals, setChainGoals] = useState<ChainGoal[]>([])
  const [chainLoading, setChainLoading] = useState(false)
  const [txStatus, setTxStatus] = useState<'idle' | 'submitted' | 'pending' | 'confirmed' | 'failed'>('idle')
  const [txMessage, setTxMessage] = useState('')
  const [txHash, setTxHash] = useState('')
  const [transactions, setTransactions] = useState<StoredTransaction[]>([])
  const [vaultForm, setVaultForm] = useState({ name: '', targetMon: '', deadline: '' })
  const [confirmAction, setConfirmAction] = useState<{ kind: 'deposit' | 'withdraw' | 'cancel'; goalId: bigint; amount: string } | null>(null)

  useEffect(() => { localStorage.setItem(STORE.profile, JSON.stringify(profile)) }, [profile])
  useEffect(() => { localStorage.setItem(STORE.sample, JSON.stringify(isSample)) }, [isSample])
  useEffect(() => { localStorage.setItem(STORE.goals, JSON.stringify(goals)) }, [goals])
  useEffect(() => { localStorage.setItem(STORE.prices, JSON.stringify(observations)) }, [observations])
  useEffect(() => {
    let current = true
    void new ManualPriceProvider(observations).getHistory(priceForm.product).then((history) => {
      if (current) setActiveObservationProduct(history)
    })
    return () => { current = false }
  }, [observations, priceForm.product])

  const decision = useMemo(() => calculateDecision(profile, purchase), [profile, purchase])
  const score = useMemo(() => calculateSafetyScore(profile, purchase.price, goals), [profile, purchase.price, goals])
  const emiResult: EmiResult | null = useMemo(() => {
    if (emiRate.trim() === '') return null
    try {
      return calculateEmi({ principal: purchase.price, annualRate: Number(emiRate), tenureMonths: Number(emiTenure), processingFee: Number(emiFee), otherFees: Number(emiOtherFees), income: profile.incomeMonthly, essentials: profile.essentialExpensesMonthly, debt: profile.debtMonthly, savingsTarget: profile.monthlySavingsTarget })
    } catch { return null }
  }, [emiRate, emiTenure, emiFee, emiOtherFees, purchase.price, profile])
  useEffect(() => {
    if (emiRate.trim() === '') { setEmiError(''); return }
    try {
      calculateEmi({ principal: purchase.price, annualRate: Number(emiRate), tenureMonths: Number(emiTenure), processingFee: Number(emiFee), otherFees: Number(emiOtherFees) })
      setEmiError('')
    } catch (error) { setEmiError(error instanceof Error ? error.message : 'Enter valid loan details.') }
  }, [emiRate, emiTenure, emiFee, emiOtherFees, purchase.price])
  const scenarioResults = useMemo(() => {
    const profileAdjusted = { ...profile, liquidSavings: profile.liquidSavings, upcomingExpenses: Math.max(0, scenarioUpcoming), incomeMonthly: Math.max(0, profile.incomeMonthly + scenarioIncomeDelta) }
    const targetDateDays = selectedDate ? Math.max(0, Math.ceil((new Date(`${selectedDate}T23:59:59`).getTime() - Date.now()) / 86400000)) : scenarioWait
    const scenarios: Scenario[] = [
      { id: 'today', label: 'Buy today', waitDays: 0, price: scenarioPrice, contribution: scenarioContribution, type: 'cash' },
      { id: '7days', label: 'Wait 7 days', waitDays: 7, price: scenarioPrice, contribution: scenarioContribution, type: 'cash' },
      { id: '30days', label: 'Wait 30 days', waitDays: 30, price: scenarioPrice, contribution: scenarioContribution, type: 'cash' },
      { id: 'date', label: selectedDate ? `Wait until ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : `Wait ${scenarioWait} days`, waitDays: targetDateDays, price: scenarioPrice, contribution: scenarioContribution, type: 'cash' },
      { id: 'alternative', label: 'Cheaper alternative', waitDays: 7, price: scenarioAlternative, contribution: scenarioContribution, type: 'cash' },
      ...(emiResult ? [{ id: 'emi', label: `Finance over ${emiTenure} months`, waitDays: 0, price: scenarioPrice, contribution: scenarioContribution, monthlyEmi: emiResult.emi, type: 'emi' as const }] : []),
    ]
    return compareScenarios(profileAdjusted, scenarios)
  }, [profile, scenarioPrice, scenarioWait, scenarioContribution, scenarioAlternative, scenarioIncomeDelta, scenarioUpcoming, selectedDate, emiResult, emiTenure])

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3800) }
  const submitPurchase = (event: React.FormEvent) => { event.preventDefault(); setAiExplanation(''); setView('decision') }
  const updateProfile = (key: keyof AppProfile, value: number) => { const nextValue = key === 'nextIncomeInDays' ? Math.min(30, Math.max(0, value)) : Math.max(0, value); setProfile((current) => ({ ...current, [key]: nextValue })); setIsSample(false) }
  const finishOnboarding = (destination: 'home' | 'settings') => { setHasOnboarded(true); localStorage.setItem('waitwise.onboarded.v1', 'true'); setView(destination) }
  const resetSample = () => {
    setProfile(SAMPLE_PROFILE); setIsSample(true); setGoals([]); setObservations([]); localStorage.removeItem('waitwise.vaultLabels.v1');
    setAiExplanation(''); setTransactions([]); notify('Example profile restored. No wallet funds were changed.')
  }

  const requestExplanation = async () => {
    setExplaining(true); setAiUnavailable(false); setAiExplanation('')
    try {
      const response = await fetch('/api/explain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: purchase.name, question: `Why is this classified as ${decision.recommendation}?`, calculation: decision }),
      })
      const body = await response.json() as { explanation?: string; error?: string }
      if (!response.ok || !body.explanation) throw new Error(body.error || 'AI explanation is unavailable.')
      setAiExplanation(body.explanation)
    } catch {
      setAiUnavailable(true)
      setAiExplanation(`${decision.reason} This estimate uses your entered values only. ${decision.assumptions[0]}`)
    } finally { setExplaining(false) }
  }

  const submitGoal = (event: React.FormEvent) => {
    event.preventDefault(); setGoalError('')
    const target = Number(goalForm.target), current = Number(goalForm.current), contribution = Number(goalForm.contribution)
    if (!goalForm.name.trim() || !Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0 || current > target || !Number.isFinite(contribution) || contribution < 0) {
      setGoalError('Enter a name, a target above zero, a starting amount between zero and the target, and a non-negative monthly contribution.'); return
    }
    if (!goalForm.date) { setGoalError('Choose a target date so you can compare the plan to a real timeframe.'); return }
    const goal: SavingsGoal = { id: crypto.randomUUID(), name: goalForm.name.trim(), target, current, monthlyContribution: contribution, targetDate: goalForm.date, createdAt: new Date().toISOString() }
    setGoals((currentGoals) => [goal, ...currentGoals])
    setGoalForm({ name: '', target: '', current: '0', contribution: '', date: '' })
    notify('Savings plan added on this device. No money was moved.')
  }

  const addObservation = (event: React.FormEvent) => {
    event.preventDefault(); setPriceError('')
    const price = Number(priceForm.price)
    if (!priceForm.product.trim() || !Number.isFinite(price) || price <= 0 || !priceForm.date) { setPriceError('Enter a product, a positive price, and an observation date.'); return }
    if (priceForm.url && !/^https?:\/\//i.test(priceForm.url)) { setPriceError('Use a full http or https URL, or leave the link blank.'); return }
    const observation: PriceObservation = { id: crypto.randomUUID(), product: priceForm.product.trim(), price, observedAt: priceForm.date, source: 'Entered by you', productUrl: priceForm.url.trim() || undefined }
    setObservations((current) => [...current, observation].sort((a, b) => a.observedAt.localeCompare(b.observedAt)))
    setPriceForm((current) => ({ ...current, price: '' }))
    notify('Price observation saved locally and labelled as manual.')
  }

  const loadVault = async (address = walletAddress) => {
    if (!address || !window.ethereum || !TESTNET.contract) return
    setChainLoading(true); setWalletError('')
    try {
      const provider = new BrowserProvider(window.ethereum)
      const network = await provider.getNetwork()
      setWrongNetwork(Number(network.chainId) !== TESTNET.chainId)
      if (Number(network.chainId) !== TESTNET.chainId) { setChainGoals([]); return }
      const balance = await provider.getBalance(address)
      setWalletBalance(formatEther(balance))
      const contract = new Contract(TESTNET.contract, VAULT_ABI, provider)
      const ids = await contract.getOwnerGoalIds(address) as bigint[]
      const mapped = await Promise.all(ids.map(async (id) => {
        const item = await contract.getGoal(id)
        const status = Number(await contract.getStatus(id))
        return { id, target: item.targetAmount as bigint, balance: item.balance as bigint, deadline: item.deadline as bigint, status, reference: item.referenceHash as string }
      }))
      setChainGoals(mapped.reverse())
      try {
        const latest = await provider.getBlockNumber()
        const fromBlock = Math.max(0, latest - 100_000)
        const eventSets = await Promise.all([
          contract.queryFilter(contract.filters.Deposited(address), fromBlock, latest),
          contract.queryFilter(contract.filters.Withdrawn(address), fromBlock, latest),
          contract.queryFilter(contract.filters.GoalCreated(address), fromBlock, latest),
          contract.queryFilter(contract.filters.GoalCancelled(address), fromBlock, latest),
        ])
        const records = eventSets.flat().map((event) => ({ hash: event.transactionHash, blockNumber: event.blockNumber, kind: 'fragment' in event ? event.fragment.name : 'Contract event', at: '' })).sort((a, b) => b.blockNumber - a.blockNumber)
        setTransactions(records)
      } catch { setTransactions([]) }
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Could not read vault state from Monad Testnet.')
    } finally { setChainLoading(false) }
  }

  const connectWallet = async () => {
    setWalletError('')
    if (!window.ethereum) { setWalletError('No compatible wallet was detected. Install or open a wallet such as MetaMask, then connect to Monad Testnet.'); return }
    try {
      const provider = new BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', []) as string[]
      const address = accounts[0]
      if (!address) throw new Error('Wallet did not return an account.')
      setWalletAddress(address)
      const network = await provider.getNetwork()
      setWrongNetwork(Number(network.chainId) !== TESTNET.chainId)
      if (Number(network.chainId) === TESTNET.chainId) await loadVault(address)
      else setWalletError('Wallet connected. Switch to Monad Testnet before reading or sending vault transactions.')
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Wallet connection failed or was rejected.')
    }
  }

  const switchNetwork = async () => {
    if (!window.ethereum) return
    setWalletError('')
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: TESTNET.hexChainId }] })
    } catch (error) {
      const code = (error as { code?: number }).code
      if (code === 4902) {
        try {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: TESTNET.hexChainId, chainName: TESTNET.name, nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: [TESTNET.rpc], blockExplorerUrls: [TESTNET.explorer] }] })
        } catch (addError) { setWalletError(addError instanceof Error ? addError.message : 'Could not add Monad Testnet to the wallet.') }
      } else setWalletError(error instanceof Error ? error.message : 'Network switch was rejected.')
    }
    window.setTimeout(() => { void loadVault() }, 700)
  }

  const sendVaultTransaction = async (kind: 'create' | 'deposit' | 'withdraw' | 'cancel', goalId?: bigint, amount?: string) => {
    if (!walletAddress || !window.ethereum || !TESTNET.contract) return
    setTxStatus('submitted'); setTxHash(''); setTxMessage('Waiting for wallet confirmation…'); setWalletError('')
    try {
      const provider = new BrowserProvider(window.ethereum)
      const network = await provider.getNetwork()
      if (Number(network.chainId) !== TESTNET.chainId) throw new Error('Wrong network. Switch to Monad Testnet and retry.')
      const signer = await provider.getSigner()
      const contract = new Contract(TESTNET.contract, VAULT_ABI, signer)
      let tx
      if (kind === 'create') {
        const target = parseEther(vaultForm.targetMon)
        const deadline = vaultForm.deadline ? Math.floor(new Date(`${vaultForm.deadline}T23:59:59`).getTime() / 1000) : 0
        tx = await contract.createGoal(target, deadline, keccak256(toUtf8Bytes(vaultForm.name.trim())))
      } else if (kind === 'deposit') tx = await contract.deposit(goalId, { value: parseEther(amount || '0') })
      else if (kind === 'withdraw') tx = await contract.withdraw(goalId, parseEther(amount || '0'))
      else tx = await contract.cancelGoal(goalId)
      setTxHash(tx.hash); setTxStatus('pending'); setTxMessage('Transaction submitted. Waiting for Monad Testnet confirmation…')
      const receipt = await tx.wait()
      if (!receipt || receipt.status !== 1) throw new Error('The transaction was included but did not succeed.')
      setTxStatus('confirmed'); setTxMessage('Transaction confirmed on Monad Testnet. Vault state was refreshed from the contract.')
      if (kind === 'create') {
        const parsedEvent = receipt.logs.map((log: { topics: string[]; data: string }) => { try { return contract.interface.parseLog(log) } catch { return null } }).find((event: { name: string } | null) => event?.name === 'GoalCreated') as { args: { goalId: bigint } } | undefined
        const newId = parsedEvent?.args.goalId
        if (newId) {
          const key = 'waitwise.vaultLabels.v1'
          const labels = readStored<Record<string, string>>(key, {})
          labels[`${walletAddress.toLowerCase()}:${newId}`] = vaultForm.name.trim()
          localStorage.setItem(key, JSON.stringify(labels))
        }
        setVaultForm({ name: '', targetMon: '', deadline: '' })
      }
      await loadVault()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transaction failed.'
      setTxStatus('failed'); setTxMessage(message); setWalletError(message)
    }
  }

  const beginCreateVaultGoal = (event: React.FormEvent) => {
    event.preventDefault()
    if (!vaultForm.name.trim() || !vaultForm.targetMon || Number(vaultForm.targetMon) <= 0) { setWalletError('Enter a goal name and a positive MON target.'); return }
    if (!window.confirm(`Create a testnet savings commitment named “${vaultForm.name}” with target ${vaultForm.targetMon} MON? This writes a public reference hash to Monad Testnet and requires a wallet transaction fee.`)) return
    void sendVaultTransaction('create')
  }

  const latestObservation = activeObservationProduct.at(-1)
  const maxObservation = activeObservationProduct.length >= 2 ? Math.max(...activeObservationProduct.map((item) => item.price)) : null
  const minObservation = activeObservationProduct.length >= 2 ? Math.min(...activeObservationProduct.map((item) => item.price)) : null
  const atTarget = Boolean(latestObservation && priceTarget && latestObservation.price <= Number(priceTarget))

  const navigation = [
    { id: 'welcome' as const, label: hasOnboarded ? 'Getting started' : 'Welcome', icon: Sparkles, section: 'MORE' },
    { id: 'home' as const, label: 'Overview', icon: Home, section: 'PLAN' },
    { id: 'decision' as const, label: 'Buy or wait', icon: Activity, section: 'PLAN' },
    { id: 'simulator' as const, label: 'What-if planner', icon: BarChart3, section: 'PLAN' },
    { id: 'emi' as const, label: 'EMI checker', icon: CreditCard, section: 'PLAN' },
    { id: 'prices' as const, label: 'Price watch', icon: Bell, section: 'TOOLS' },
    { id: 'goals' as const, label: 'Savings goals', icon: Target, section: 'TOOLS' },
    { id: 'vault' as const, label: 'Onchain vault', icon: Wallet, section: 'TOOLS' },
    { id: 'settings' as const, label: 'Profile & privacy', icon: LockKeyhole, section: 'MORE' },
    { id: 'help' as const, label: 'How it works', icon: CircleHelp, section: 'MORE' },
  ]
  const pageName = navigation.find((item) => item.id === view)?.label || 'Overview'

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="/logo/waitwise-mark.svg" alt="" /><div><strong>waitwise<span>AI</span></strong><small>Buy smarter. Stress less.</small></div></div>
      <div className="sidebar-label">YOUR SPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {['PLAN', 'TOOLS', 'MORE'].map((section) => <div className="nav-section" key={section}><span className="nav-section-label">{section}</span>{navigation.filter((item) => item.section === section).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={cx('nav-link', view === id && 'nav-link-active')} aria-current={view === id ? 'page' : undefined}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'vault' && <span className="nav-live-dot" />}</button>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><div className="vault-promo"><div className="promo-icon"><ShieldCheck size={18} /></div><strong>Your money, your rules.</strong><p>Testnet goals are transparent and owner-controlled.</p><button onClick={() => setView('vault')}>Explore the vault <ArrowRight size={14} /></button></div><button className="sidebar-help" onClick={() => setView('help')}><CircleHelp size={15} /> Help & explanations</button><div className="sidebar-network"><span className="online-dot" /> {TESTNET.name} <span className="network-test">TEST</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="mobile-brand"><img src="/logo/waitwise-mark.svg" alt=""/><strong>waitwise<span>AI</span></strong></div><div className="breadcrumb"><span>WAITWISE AI</span><span className="breadcrumb-slash">/</span><strong>{pageName}</strong></div><div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button className="avatar-button" onClick={() => setView('settings')} aria-label="Open profile and privacy settings">D</button></div></header>
      <main className="page-content">
        {isSample && view !== 'welcome' && <div className="sample-banner"><Info size={16} /><span><strong>Example profile.</strong> These numbers are sample inputs saved on this device. Update them to get a personal estimate.</span><button onClick={() => setView('settings')}>Edit profile <ArrowRight size={14} /></button></div>}

        {view === 'welcome' && <>
          <PageHeading eyebrow="WELCOME TO WAITWISE AI" title="A calmer way to think through a big purchase." description="We’ll help you look at the month around the purchase, show the assumptions, and make room for your own judgment." />
          <div className="welcome-layout"><Card className="welcome-hero"><div className="welcome-mark"><img src="/logo/waitwise-mark.svg" alt=""/></div><div className="eyebrow">BUY SMARTER. STRESS LESS.</div><h2>Pause for a clearer picture.</h2><p>Check a laptop, phone, or study purchase against the savings, bills, and reserve you choose to enter. No bank login. No hidden price predictions.</p><div className="welcome-steps"><div><span>01</span><strong>Enter your numbers</strong><small>Use a sample profile or your own estimates.</small></div><div><span>02</span><strong>See the trade-offs</strong><small>Buy now, wait, and lower-cost options.</small></div><div><span>03</span><strong>Choose your next step</strong><small>A plan is yours to edit or remove.</small></div></div></Card><div className="welcome-choice-column"><Card className="welcome-choice"><div className="welcome-choice-icon"><Sparkles size={19}/></div><div className="eyebrow">QUICK TOUR</div><h3>Explore the example profile</h3><p>See the dashboard with clearly labeled sample values. Change them at any time.</p><button className="button button-primary button-wide" onClick={() => finishOnboarding('home')}>Explore example <ArrowRight size={15}/></button></Card><Card className="welcome-choice"><div className="welcome-choice-icon choice-outline"><Banknote size={19}/></div><div className="eyebrow">MAKE IT PERSONAL</div><h3>Enter my own estimates</h3><p>Start with a private browser profile. Nothing is checked against a bank.</p><button className="button button-secondary button-wide" onClick={() => finishOnboarding('settings')}>Set up my profile <ArrowRight size={15}/></button></Card><div className="welcome-safety"><ShieldCheck size={16}/><span>Educational estimates only. No credit score, lender offer, guaranteed saving, or future-price promise.</span></div></div></div>
        </>}

        {view === 'home' && <>
          <PageHeading eyebrow="YOUR MONEY, IN CONTEXT" title="A little clarity before the big buy." description="See what a purchase could mean for your month, your buffer, and the goals you care about." action={<button className="button button-outline" onClick={() => setView('settings')}><RotateCcw size={15} /> Edit my numbers</button>} />
          <div className="hero-grid">
            <Card className="hero-purchase"><div className="hero-copy"><span className="eyebrow">START WITH A DECISION</span><h2>What do you want to buy?</h2><p>A few numbers can make a big decision feel clearer.</p></div><PurchaseForm purchase={purchase} setPurchase={setPurchase} onSubmit={submitPurchase} compact /></Card>
            <Card className="score-card"><div className="score-card-heading"><div><div className="eyebrow">FINANCIAL SAFETY SCORE</div><h3>Your snapshot</h3></div><button className="icon-button" onClick={() => setView('decision')} aria-label="View score details"><ArrowRight size={17} /></button></div><div className="score-card-body"><ScoreRing score={score.total} /><div><Badge tone={score.total >= 75 ? 'green' : score.total >= 50 ? 'amber' : 'red'}>{score.total >= 75 ? 'Building well' : score.total >= 50 ? 'Room to improve' : 'Needs attention'}</Badge><p>Educational indicator, not a credit score or guarantee.</p><button className="text-button" onClick={() => setView('decision')}>See what shapes it <ArrowRight size={14} /></button></div></div><div className="score-mini-list">{score.components.map((item) => <div key={item.key}><span>{item.label}</span><strong>{Math.round(item.score)}<small>/{item.max}</small></strong></div>)}</div></Card>
          </div>
          <div className="section-title-row"><div><div className="eyebrow">YOUR CURRENT PICTURE</div><h2>Keep the whole month in view</h2></div><button className="text-button" onClick={() => setView('settings')}>Adjust inputs <ArrowRight size={14} /></button></div>
          <div className="metric-grid"><Metric label="Liquid savings" value={money(profile.liquidSavings)} icon={Banknote} detail="Entered by you" tone="tone-green"/><Metric label="Monthly income" value={money(profile.incomeMonthly)} icon={ArrowDownRight} detail="Before expenses"/><Metric label="Essential + debt" value={money(profile.essentialExpensesMonthly + profile.debtMonthly)} icon={CreditCard} detail={`${money(profile.upcomingExpenses)} upcoming`} tone="tone-amber"/><Metric label="Planned to save" value={`${money(profile.monthlySavingsTarget)} / mo`} icon={Target} detail="Your monthly target" tone="tone-blue"/></div>
          <div className="home-bottom-grid"><Card><div className="card-heading"><div><div className="eyebrow">SAVINGS PLAN</div><h3>Small steps, clear target</h3></div><span className="card-icon"><Target size={17}/></span></div>{goals.length === 0 ? <div className="empty-inline"><div className="empty-icon"><Target size={19}/></div><div><strong>No savings goals yet</strong><p>Create a plan for something you want to buy or save toward.</p></div><button className="button button-secondary button-small" onClick={() => setView('goals')}>Add a goal <Plus size={14}/></button></div> : <div className="goal-preview-list">{goals.slice(0, 2).map((goal) => <GoalProgress key={goal.id} goal={goal} onRemove={() => setGoals((current) => current.filter((item) => item.id !== goal.id))} compact />)}<button className="text-button" onClick={() => setView('goals')}>Manage goals <ArrowRight size={14}/></button></div>}</Card><Card className="next-step-card"><div className="eyebrow">A USEFUL NEXT STEP</div><h3>{decision.recommendation === 'BUY NOW' ? 'You have room in this estimate.' : 'Give the plan a little more room.'}</h3><p>{decision.recommendation === 'BUY NOW' ? 'Review the assumptions and risks before you commit.' : `A lower price or a later date may protect your ${money(profile.reserveTarget)} reserve.`}</p><button className="button button-primary button-small" onClick={() => setView('simulator')}>Compare scenarios <ArrowRight size={15}/></button><div className="next-step-decoration"><div/><div/><div/></div></Card></div>
          <div className="home-footer-note"><ShieldCheck size={15}/> No bank connection. Your profile stays in this browser unless you choose an optional AI explanation.</div>
        </>}

        {view === 'decision' && <>
          <PageHeading eyebrow="PURCHASE CHECK-IN" title="Buy now, wait, or rethink it?" description="The recommendation comes from clear rules using the numbers you provide. No price predictions or hidden scores." />
          <div className="decision-input-wrap"><Card className="decision-input-card"><div className="card-heading"><div><div className="eyebrow">YOUR PURCHASE</div><h3>Tell us what is on your mind</h3></div><span className="card-icon"><Laptop size={18}/></span></div><PurchaseForm purchase={purchase} setPurchase={(next) => { setPurchase(next); setAiExplanation('') }} onSubmit={submitPurchase}/></Card><div className="decision-output"><DecisionPanel result={decision} purchase={purchase} onExplain={() => void requestExplanation()} explaining={explaining} aiExplanation={aiExplanation} aiUnavailable={aiUnavailable}/></div></div>
          <Card className="score-breakdown-card"><div className="card-heading"><div><div className="eyebrow">EDUCATIONAL INDICATOR</div><h3>What shapes your safety score</h3><p>Internal, explainable snapshot. Not a credit score or a promise of financial safety.</p></div><ScoreRing score={score.total}/></div><div className="score-components">{score.components.map((component) => <div className="score-component" key={component.key}><div className="score-component-top"><strong>{component.label}</strong><span>{Math.round(component.score)} <small>/ {component.max}</small></span></div><div className="component-track"><span style={{ width: `${component.score / component.max * 100}%` }}/></div><p>{component.explanation}</p></div>)}</div>{score.missing.length > 0 && <div className="data-warning"><Info size={16}/> Add more information to complete the score: {score.missing.join(', ')}.</div>}<ul className="suggestion-row">{score.suggestions.slice(0, 3).map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></Card>
        </>}

        {view === 'simulator' && <>
          <PageHeading eyebrow="WHAT-IF PLANNER" title="Try a few paths before you choose." description="Change one assumption at a time. Future prices and income are never guessed; your scenarios use the values you enter." />
          <div className="simulator-layout"><Card className="sim-controls"><div className="card-heading"><div><div className="eyebrow">ADJUST THE SCENARIO</div><h3>Your assumptions</h3></div><span className="card-icon"><Activity size={18}/></span></div><Field label="Purchase price today (₹)"><input type="number" min="1" value={scenarioPrice} onChange={(event) => setScenarioPrice(Math.max(0, Number(event.target.value)))}/></Field><Field label="Monthly savings contribution (₹)"><input type="number" min="0" value={scenarioContribution} onChange={(event) => setScenarioContribution(Math.max(0, Number(event.target.value)))}/><span className="field-hint">This is the amount the scenario assumes you set aside each month.</span></Field><Field label="Wait period for custom date (days)"><input type="number" min="0" max="730" value={scenarioWait} onChange={(event) => setScenarioWait(Math.max(0, Number(event.target.value)))}/></Field><Field label="Choose a date (optional)"><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}/></Field><Field label="Cheaper alternative price (₹)"><input type="number" min="1" value={scenarioAlternative} onChange={(event) => setScenarioAlternative(Math.max(0, Number(event.target.value)))}/></Field><Field label="Change to expected monthly income (₹)"><input type="number" value={scenarioIncomeDelta} onChange={(event) => setScenarioIncomeDelta(Number(event.target.value))}/><span className="field-hint">A scenario adjustment only; not a forecast.</span></Field><Field label="Upcoming expenses in this scenario (₹)"><input type="number" min="0" value={scenarioUpcoming} onChange={(event) => setScenarioUpcoming(Math.max(0, Number(event.target.value)))}/></Field><div className="scenario-note"><Info size={15}/> Same current product price is used for each date. The future price is unknown.</div></Card>
            <div className="scenario-results"><div className="scenario-results-heading"><div><div className="eyebrow">SIDE-BY-SIDE COMPARISON</div><h2>Each path, in today’s rupees</h2></div><span className="live-pill"><span/> Updates as you type</span></div><div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>Scenario</th><th>Price</th><th>Cash at purchase</th><th>Cash after obligations</th><th>Monthly surplus after EMI</th><th>Possible shortfall</th></tr></thead><tbody>{scenarioResults.map((scenario) => <tr key={scenario.id}><td><strong>{scenario.label}</strong><small>{scenario.estimatedDate === new Date().toISOString().slice(0, 10) ? 'Today' : new Date(`${scenario.estimatedDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></td><td>{money(scenario.price)}{scenario.monthlyEmi ? <small>{money(scenario.monthlyEmi)} / mo EMI</small> : <small>Current price assumption</small>}</td><td>{money(scenario.cashAtPurchase)}<small>{money(scenario.savingsProgress)} into goal plan</small></td><td className={scenario.remainingAfter < profile.reserveTarget ? 'text-amber' : 'text-green'}>{money(scenario.remainingAfter)}<small>before reserve check</small></td><td>{money(scenario.monthlySurplusAfter)}</td><td>{scenario.shortfall > 0 ? <Badge tone="red">{money(scenario.shortfall)}</Badge> : <Badge tone="green">None in estimate</Badge>}</td></tr>)}</tbody></table></div><Card className="scenario-chart-card"><div className="card-heading"><div><div className="eyebrow">CASH BUFFER</div><h3>Estimated cash after purchase</h3></div><span className="card-icon"><BarChart3 size={18}/></span></div><div className="scenario-bars">{scenarioResults.map((scenario) => <div className="scenario-bar-row" key={scenario.id}><span>{scenario.label}</span><div className="scenario-bar"><span style={{ width: `${Math.max(0, Math.min(100, scenario.remainingAfter / Math.max(1, Math.max(...scenarioResults.map((s) => Math.max(0, s.remainingAfter)))) * 100))}%` }}/></div><strong>{money(scenario.remainingAfter)}</strong></div>)}</div></Card><div className="scenario-note scenario-assumptions"><Info size={15}/> Estimates use the entered monthly income less essential costs and debt as steady net cash flow; no unexpected costs or future price reduction are assumed.</div></div>
          </div>
        </>}

        {view === 'emi' && <>
          <PageHeading eyebrow="SMART EMI CHECKER" title="Know the full cost of paying over time." description="Enter an actual lender offer to estimate payments. WAITWISE does not fetch rates or have lender partnerships." />
          <div className="emi-layout"><Card><div className="card-heading"><div><div className="eyebrow">ENTER THE OFFER</div><h3>Finance scenario</h3></div><span className="card-icon"><CreditCard size={18}/></span></div><div className="emi-principal-strip"><span>Product price</span><strong>{money(purchase.price)}</strong><button className="text-button" onClick={() => setView('decision')}>Change purchase <ArrowRight size={13}/></button></div><Field label="Loan amount (₹)"><input type="number" min="1" value={purchase.price} onChange={(event) => setPurchase({ ...purchase, price: Math.max(0, Number(event.target.value)) })}/></Field><Field label="Annual interest rate (%)"><input type="number" min="0" max="100" step="0.01" placeholder="Enter rate from the offer" value={emiRate} onChange={(event) => setEmiRate(event.target.value)}/><span className="field-hint">Use the disclosed rate. Enter 0 only for an explicitly interest-free offer.</span></Field><Field label="Loan term (months)"><input type="number" min="1" max="600" step="1" value={emiTenure} onChange={(event) => setEmiTenure(event.target.value)}/></Field><Field label="Processing fee (₹)"><input type="number" min="0" step="1" value={emiFee} onChange={(event) => setEmiFee(event.target.value)}/></Field><Field label="Other disclosed fees (₹)"><input type="number" min="0" step="1" value={emiOtherFees} onChange={(event) => setEmiOtherFees(event.target.value)}/></Field>{emiError && <div className="form-error"><AlertCircle size={15}/>{emiError}</div>}<div className="scenario-note"><Info size={15}/> Calculations are estimates, excluding taxes or terms you have not entered. Actual lender offers may differ.</div></Card>
            <div className="emi-results">{emiResult ? <><div className="emi-result-hero"><div className="eyebrow">ESTIMATED MONTHLY PAYMENT</div><strong>{money(emiResult.emi)}<small> / month</small></strong><p>Based on {emiTenure} monthly payments and {emiRate}% annual interest.</p></div><div className="emi-metrics"><Metric label="Total installments" value={money(emiResult.totalRepayment)} icon={Banknote}/><Metric label="Total interest" value={money(emiResult.totalInterest)} icon={ArrowUpRight} tone="tone-amber"/><Metric label="Fees entered" value={money(emiResult.totalFees)} icon={FileText}/><Metric label="Total financing cost" value={money(emiResult.totalFinancingCost)} icon={Coins} tone="tone-blue"/></div><Card className="emi-surplus-card"><div className="card-heading"><div><div className="eyebrow">MONTHLY BUDGET EFFECT</div><h3>After the EMI</h3></div><span className="card-icon"><Activity size={18}/></span></div><div className="emi-surplus-number"><strong className={emiResult.remainingMonthlySurplus !== null && emiResult.remainingMonthlySurplus < 0 ? 'text-red' : 'text-green'}>{emiResult.remainingMonthlySurplus === null ? '—' : money(emiResult.remainingMonthlySurplus)}</strong><span>estimated surplus after essentials, existing debt, planned savings, and EMI</span></div><div className="emi-comparison"><div><span>Save first</span><strong>{profile.monthlySavingsTarget > 0 ? `${Math.ceil(purchase.price / profile.monthlySavingsTarget)} months` : 'Set monthly savings'}</strong><small>at the monthly target you entered</small></div><div><span>Finance now</span><strong>{emiTenure} months</strong><small>{money(emiResult.totalFinancingCost - purchase.price)} more than principal, including fees</small></div></div></Card><button className="button button-secondary" onClick={() => setView('simulator')}>Compare this EMI in what-if planner <ArrowRight size={15}/></button></> : <Card className="emi-empty"><div className="empty-icon"><CreditCard size={20}/></div><h3>Enter a lender’s rate to see the estimate</h3><p>The calculator does not assume or recommend a current interest rate. Add the rate and fees from an offer you are reviewing.</p><div className="emi-empty-facts"><span><Check size={15}/> Zero-interest offers supported</span><span><Check size={15}/> Fees included separately</span><span><Check size={15}/> Budget impact shown</span></div></Card>}</div>
          </div>
        </>}

        {view === 'prices' && <>
          <PageHeading eyebrow="PRICE INTELLIGENCE" title="Keep track of prices you actually see." description="Add manual observations. WAITWISE will show your recorded range, not invent price history or predict a future drop." />
          <div className="price-layout"><div className="price-main-column"><Card className="price-chart-card"><div className="card-heading"><div><div className="eyebrow">MANUAL OBSERVATIONS</div><h3>{priceForm.product || 'Product'} price history</h3></div><Badge tone="neutral">User-entered data</Badge></div>{activeObservationProduct.length >= 2 ? <div className="price-chart"><ResponsiveContainer width="100%" height={260}><AreaChart data={activeObservationProduct} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#64cfa0" stopOpacity={0.22}/><stop offset="100%" stopColor="#64cfa0" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#edf0ed" vertical={false}/><XAxis dataKey="observedAt" tickFormatter={(date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} axisLine={false} tickLine={false} tick={{ fill: '#89928d', fontSize: 11 }}/><YAxis tickFormatter={(value) => `₹${formatNumber(value / 1000)}k`} axisLine={false} tickLine={false} tick={{ fill: '#89928d', fontSize: 11 }} width={56}/><Tooltip formatter={(value) => [money(Number(value)), 'Observed price']} labelFormatter={(label) => new Date(`${label}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} contentStyle={{ borderRadius: 12, borderColor: '#e7ebe8', boxShadow: '0 8px 28px #15233a14' }}/><Area type="monotone" dataKey="price" stroke="#36a878" strokeWidth={2.5} fill="url(#priceFill)" activeDot={{ r: 5, fill: '#36a878' }}/></AreaChart></ResponsiveContainer></div> : <div className="chart-empty"><div className="chart-empty-grid"><span/><span/><span/></div><div className="empty-icon"><BarChart3 size={20}/></div><strong>{activeObservationProduct.length === 1 ? 'One observation recorded' : 'No price history yet'}</strong><p>{activeObservationProduct.length === 1 ? 'Add at least one more date to compare your observed range.' : 'Add prices you personally observe. Historical data appears only after your entries.'}</p></div>}<div className="price-stats"><div><span>Latest observation</span><strong>{latestObservation ? money(latestObservation.price) : '—'}</strong></div><div><span>Lowest observed</span><strong>{minObservation === null ? 'Need 2 entries' : money(minObservation)}</strong></div><div><span>Highest observed</span><strong>{maxObservation === null ? 'Need 2 entries' : money(maxObservation)}</strong></div></div></Card>
              <Card className="observation-list-card"><div className="card-heading"><div><div className="eyebrow">YOUR RECORD</div><h3>Observation history</h3></div><span className="card-icon"><CalendarDays size={17}/></span></div>{activeObservationProduct.length === 0 ? <p className="muted-copy">Observations you enter for this product will appear here.</p> : <div className="observation-list">{[...activeObservationProduct].reverse().map((item) => <div className="observation-row" key={item.id}><span className="observation-dot"/><div><strong>{money(item.price)}</strong><small>{new Date(`${item.observedAt}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {item.source}{item.productUrl ? <> · <a href={item.productUrl} target="_blank" rel="noreferrer">Open link <ExternalLink size={10}/></a></> : null}</small></div><button className="icon-button subtle-danger" aria-label={`Delete price observation ${money(item.price)}`} onClick={() => setObservations((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 size={15}/></button></div>)}</div>}</Card></div>
            <div className="price-side-column"><Card><div className="card-heading"><div><div className="eyebrow">ADD AN OBSERVATION</div><h3>What price did you see?</h3></div><span className="card-icon"><Plus size={17}/></span></div><form onSubmit={addObservation}><Field label="Product name"><input value={priceForm.product} onChange={(event) => setPriceForm({ ...priceForm, product: event.target.value })} required maxLength={100}/></Field><Field label="Observed price (₹)"><input type="number" min="1" value={priceForm.price} onChange={(event) => setPriceForm({ ...priceForm, price: event.target.value })} required/></Field><Field label="Date observed"><input type="date" value={priceForm.date} onChange={(event) => setPriceForm({ ...priceForm, date: event.target.value })} required/></Field><Field label="Product link (optional)"><input type="url" placeholder="https://…" value={priceForm.url} onChange={(event) => setPriceForm({ ...priceForm, url: event.target.value })}/><span className="field-hint">Saved as your reference. No page scraping is performed.</span></Field>{priceError && <div className="form-error"><AlertCircle size={15}/>{priceError}</div>}<button className="button button-primary button-wide" type="submit"><Plus size={16}/> Save observation</button></form></Card><Card className="price-alert-card"><div className="card-heading"><div><div className="eyebrow">YOUR PRICE TARGET</div><h3>Watch for a price you choose</h3></div><span className="card-icon"><Bell size={17}/></span></div><Field label="Target price (₹)"><input type="number" min="1" placeholder="Set a target" value={priceTarget} onChange={(event) => setPriceTarget(event.target.value)}/></Field><label className="toggle-row"><span><strong>Show alert in this app</strong><small>Uses only your latest recorded price; no background alerts.</small></span><input type="checkbox" checked={priceAlert} onChange={(event) => setPriceAlert(event.target.checked)} aria-label="Enable in-app price target alert"/></label>{priceAlert && <div className={cx('target-state', atTarget ? 'target-hit' : 'target-wait')}><span className="online-dot"/>{atTarget ? `Latest entry is at or below ${money(Number(priceTarget))}.` : latestObservation ? 'Latest entry is above target; no price change is predicted.' : 'Add an observation to compare it with your target.'}</div>}</Card><div className="source-note"><ShieldCheck size={15}/><span>No authorized live price provider is configured. The app supports manually entered observations only.</span></div></div></div>
        </>}

        {view === 'goals' && <>
          <PageHeading eyebrow="PERSONAL SAVINGS PLAN" title="Put a little structure around what’s next." description="Plans are estimates stored in this browser. They do not move or lock money in your account." />
          <div className="goals-layout"><Card className="goal-form-card"><div className="card-heading"><div><div className="eyebrow">CREATE A PLAN</div><h3>What are you saving for?</h3></div><span className="card-icon"><Target size={18}/></span></div><form onSubmit={submitGoal}><Field label="Goal name"><input maxLength={70} placeholder="e.g. New laptop" value={goalForm.name} onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })} required/></Field><Field label="Target amount (₹)"><input type="number" min="1" value={goalForm.target} onChange={(event) => setGoalForm({ ...goalForm, target: event.target.value })} required/></Field><Field label="Starting amount (₹)"><input type="number" min="0" value={goalForm.current} onChange={(event) => setGoalForm({ ...goalForm, current: event.target.value })} required/></Field><Field label="Monthly contribution (₹)"><input type="number" min="0" value={goalForm.contribution} onChange={(event) => setGoalForm({ ...goalForm, contribution: event.target.value })} required/><span className="field-hint">Set 0 if you have not chosen a contribution yet.</span></Field><Field label="Target date"><input type="date" value={goalForm.date} onChange={(event) => setGoalForm({ ...goalForm, date: event.target.value })} required/></Field>{goalError && <div className="form-error"><AlertCircle size={15}/>{goalError}</div>}<button className="button button-primary button-wide" type="submit"><Plus size={16}/> Create savings plan</button></form><div className="local-data-note"><LockKeyhole size={15}/> Saved only in this browser. No bank account details needed.</div></Card><div className="goals-list-column"><div className="goal-list-heading"><div><div className="eyebrow">YOUR GOALS</div><h2>{goals.length ? `${goals.length} plan${goals.length === 1 ? '' : 's'} in progress` : 'A plan starts with one clear goal'}</h2></div><Badge tone="neutral">Planned savings only</Badge></div>{goals.length === 0 ? <Card className="goals-empty"><div className="empty-icon"><Target size={21}/></div><h3>No savings plans yet</h3><p>Set a target, starting amount, and contribution. Your estimate updates as your plan changes.</p><div className="goals-empty-steps"><span><b>01</b> Pick a target</span><span><b>02</b> Choose a pace</span><span><b>03</b> Review the estimate</span></div></Card> : <div className="goal-list">{goals.map((goal) => <GoalProgress key={goal.id} goal={goal} onRemove={() => { setGoals((current) => current.filter((item) => item.id !== goal.id)); notify('Offchain plan removed. No money was moved.') }} onContributionChange={(value) => setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, monthlyContribution: Math.max(0, value) } : item))}/>)}</div>}<div className="goal-terms"><Info size={15}/><span><strong>Planned savings are not held by WAITWISE.</strong> Only deposits confirmed by the blockchain appear in the onchain vault, and those use testnet MON rather than rupees.</span></div></div></div>
        </>}

        {view === 'vault' && <>
          <PageHeading eyebrow="ONCHAIN WAIT-TO-BUY VAULT" title="A transparent commitment for a testnet goal." description="Connect a wallet to create a goal and deposit testnet MON. Funds remain under your wallet’s control through contract-enforced rules." action={<a className="button button-outline" href={TESTNET.faucet} target="_blank" rel="noreferrer">Testnet faucet <ExternalLink size={14}/></a>} />
          <div className="vault-disclosure"><ShieldCheck size={18}/><div><strong>Before you deposit</strong><p>Amount: your chosen MON · Network: Monad Testnet · Token: testnet MON (no real-world value) · Fees: your wallet pays network fees. You can cancel any active goal, withdraw after cancelling or reaching its target, or recover after its optional deadline.</p></div><a href={TESTNET.explorer} target="_blank" rel="noreferrer">View explorer <ExternalLink size={13}/></a></div>
          {!TESTNET.contract && <div className="vault-setup-notice"><Info size={17}/><div><strong>Contract address not configured</strong><p>The vault contract and wallet flow are implemented, but no contract has been deployed from this workspace. After deployment, set <code>VITE_VAULT_ADDRESS</code> in <code>.env</code> and restart the app. No onchain action is available until then.</p></div></div>}
          <div className="vault-overview-grid"><Card className="wallet-card"><div className="card-heading"><div><div className="eyebrow">WALLET CONNECTION</div><h3>{walletAddress ? 'Wallet connected' : 'Connect your test wallet'}</h3></div><span className="card-icon"><Wallet size={18}/></span></div><WalletConnectionState address={walletAddress} wrongNetwork={wrongNetwork}/>{walletAddress ? <><div className="wallet-address-box"><div className="wallet-avatar">{walletAddress.slice(2,4).toUpperCase()}</div><div><strong>{shortAddress(walletAddress)}</strong><small>Wallet address · {wrongNetwork ? 'Network mismatch' : TESTNET.name}</small></div><button className="icon-button" onClick={() => { setWalletAddress(''); setWalletBalance(''); setChainGoals([]); setTransactions([]); setWrongNetwork(false) }} aria-label="Disconnect wallet from this app"><X size={16}/></button></div><div className="wallet-balance-row"><span>Wallet balance</span><strong>{wrongNetwork ? 'Switch network to read' : walletBalance ? `${Number(walletBalance).toFixed(4)} MON` : '—'}</strong></div>{wrongNetwork && <button className="button button-primary button-wide" onClick={() => void switchNetwork()}>Switch to Monad Testnet <ArrowRight size={15}/></button>}{!wrongNetwork && TESTNET.contract && <button className="button button-secondary button-wide" onClick={() => void loadVault()} disabled={chainLoading}>{chainLoading ? <LoaderCircle className="spin" size={15}/> : <RotateCcw size={15}/>} Refresh onchain data</button>}</> : <><p className="muted-copy">A compatible wallet is needed to sign testnet transactions. WAITWISE never asks for a seed phrase or private key.</p><button className="button button-primary button-wide" onClick={() => void connectWallet()}><Wallet size={16}/> Connect wallet</button></>}{walletError && <div className="form-error"><AlertCircle size={15}/>{walletError}</div>}<div className="network-line"><span className="online-dot"/> Chain ID 10143 <span>·</span> MON</div></Card>
            <Card className="vault-goal-create"><div className="card-heading"><div><div className="eyebrow">ONCHAIN COMMITMENT</div><h3>Create a vault goal</h3></div><span className="card-icon"><LockKeyhole size={18}/></span></div><form onSubmit={beginCreateVaultGoal}><Field label="Goal label"><input maxLength={70} placeholder="e.g. My study laptop" value={vaultForm.name} onChange={(event) => setVaultForm({ ...vaultForm, name: event.target.value })} required/></Field><Field label="Target amount (testnet MON)"><input type="number" min="0.000000000000000001" step="any" placeholder="0.5" value={vaultForm.targetMon} onChange={(event) => setVaultForm({ ...vaultForm, targetMon: event.target.value })} required/><span className="field-hint">This is a testnet token amount, not a rupee amount.</span></Field><Field label="Optional recovery date"><input type="date" value={vaultForm.deadline} onChange={(event) => setVaultForm({ ...vaultForm, deadline: event.target.value })}/><span className="field-hint">Withdrawals are available after this date, or earlier after canceling/completing the goal.</span></Field><div className="vault-rule-summary"><LockKeyhole size={16}/><span>Only your wallet can cancel, deposit to, or withdraw from this goal. There is no owner override or yield.</span></div><button className="button button-primary button-wide" type="submit" disabled={!walletAddress || wrongNetwork || !TESTNET.contract}><Plus size={16}/> Review and create goal</button>{!walletAddress && <small className="disabled-help">Connect a wallet and configure the deployed address first.</small>}{walletAddress && wrongNetwork && <small className="disabled-help">Switch to Monad Testnet to continue.</small>}</form></Card></div>
          <div className="vault-state-row"><div><div className="eyebrow">CONTRACT STATE</div><h2>Your onchain goals</h2></div><div className="vault-state-actions">{chainLoading && <span className="loading-inline"><LoaderCircle className="spin" size={15}/> Reading Monad</span>}<Badge tone={TESTNET.contract ? 'green' : 'amber'}>{TESTNET.contract ? 'Live contract address configured' : 'Deployment pending'}</Badge></div></div>
          {chainGoals.length ? <div className="chain-goal-list">{chainGoals.map((goal) => <OnchainGoal key={goal.id.toString()} goal={goal} labels={readStored<Record<string, string>>('waitwise.vaultLabels.v1', {})} owner={walletAddress} explorer={TESTNET.explorer} onDeposit={() => setConfirmAction({ kind: 'deposit', goalId: goal.id, amount: '' })} onWithdraw={() => setConfirmAction({ kind: 'withdraw', goalId: goal.id, amount: formatEther(goal.balance) })} onCancel={() => setConfirmAction({ kind: 'cancel', goalId: goal.id, amount: '' })}/>)}</div> : <Card className="vault-empty"><div className="empty-icon"><Wallet size={20}/></div><h3>{chainLoading ? 'Reading your contract state…' : walletAddress && !wrongNetwork && TESTNET.contract ? 'No onchain goals found for this wallet' : 'Your onchain goals will appear here'}</h3><p>Only contract reads and confirmed transactions are shown here. Offchain plans and rupee balances are never counted as testnet deposits.</p></Card>}
          {txStatus !== 'idle' && <Card className={cx('transaction-status-card', txStatus === 'failed' && 'transaction-failed')}><div className="transaction-status-icon">{txStatus === 'pending' || txStatus === 'submitted' ? <LoaderCircle className="spin" size={19}/> : txStatus === 'confirmed' ? <Check size={19}/> : <AlertCircle size={19}/>}</div><div><div className="eyebrow">TRANSACTION {txStatus.toUpperCase()}</div><p>{txMessage}</p>{txHash && <a href={`${TESTNET.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View confirmed transaction <ExternalLink size={13}/></a>}</div><button className="icon-button" onClick={() => { setTxStatus('idle'); setTxMessage(''); setTxHash('') }} aria-label="Dismiss transaction status"><X size={16}/></button></Card>}
          <Card className="tx-history-card"><div className="card-heading"><div><div className="eyebrow">ONCHAIN TRANSACTION HISTORY</div><h3>Recent contract activity</h3></div><span className="card-icon"><Activity size={17}/></span></div>{transactions.length === 0 ? <p className="muted-copy">Connect to a configured contract to load event history. Entries appear only when read from Monad Testnet.</p> : <div className="tx-history-list">{transactions.map((tx) => <div className="tx-history-row" key={`${tx.hash}-${tx.kind}`}><span className="tx-event-icon"><Check size={14}/></span><div><strong>{tx.kind}</strong><small>Block {tx.blockNumber} · Confirmed event from contract</small></div><a href={`${TESTNET.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">Transaction <ExternalLink size={13}/></a></div>)}</div>}<details className="advanced-details"><summary>Advanced transaction details</summary><p>Network: Monad Testnet (chain ID 10143). Contract address: {TESTNET.contract || 'not configured'}. Transactions require a connected wallet and testnet MON for network fees.</p></details></Card>
          {confirmAction && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAction(null) }}><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button className="icon-button modal-close" onClick={() => setConfirmAction(null)} aria-label="Close confirmation"><X size={17}/></button><div className="modal-icon"><ShieldCheck size={21}/></div><div className="eyebrow">REVIEW THIS ACTION</div><h2 id="confirm-title">{confirmAction.kind === 'deposit' ? 'Confirm your deposit' : confirmAction.kind === 'withdraw' ? 'Confirm your withdrawal' : 'Cancel this goal?'}</h2>{confirmAction.kind === 'deposit' ? <><p>You are about to deposit testnet MON into goal #{confirmAction.goalId.toString()}. These tokens have no real-world value and the wallet may charge a network fee.</p><Field label="Deposit amount (MON)"><input type="number" min="0.000000000000000001" step="any" value={confirmAction.amount} onChange={(event) => setConfirmAction({ ...confirmAction, amount: event.target.value })} autoFocus/></Field><div className="modal-rule"><LockKeyhole size={15}/> You can withdraw after canceling the goal, reaching its target, or after its optional deadline.</div></> : confirmAction.kind === 'withdraw' ? <><p>Withdraw up to {formatNumber(Number(confirmAction.amount), 6)} MON from goal #{confirmAction.goalId.toString()}. The contract allows this only after cancellation, target completion, or the optional deadline.</p><Field label="Withdrawal amount (MON)"><input type="number" min="0.000000000000000001" step="any" value={confirmAction.amount} onChange={(event) => setConfirmAction({ ...confirmAction, amount: event.target.value })}/></Field></> : <><p>Canceling goal #{confirmAction.goalId.toString()} makes its remaining balance withdrawable immediately by this wallet. This action is recorded publicly on Monad Testnet.</p><div className="modal-rule"><Info size={15}/> Cancellation does not transfer funds; you must withdraw them separately.</div></>}<div className="modal-actions"><button className="button button-outline" onClick={() => setConfirmAction(null)}>Go back</button><button className="button button-primary" onClick={() => { const action = confirmAction; setConfirmAction(null); void sendVaultTransaction(action.kind, action.goalId, action.amount) }}>{confirmAction.kind === 'deposit' ? 'Confirm deposit' : confirmAction.kind === 'withdraw' ? 'Confirm withdrawal' : 'Confirm cancellation'} <ArrowRight size={15}/></button></div></div></div>}
        </>}

        {view === 'settings' && <>
          <PageHeading eyebrow="PROFILE & PRIVACY" title="Your numbers should feel like yours." description="Edit your financial inputs. They are saved in browser storage on this device and are not verified against a bank." action={<button className="button button-outline" onClick={resetSample}><RotateCcw size={15}/> Reset example data</button>} />
          <div className="settings-layout"><Card><div className="card-heading"><div><div className="eyebrow">FINANCIAL PROFILE</div><h3>Numbers for your estimate</h3></div><span className="card-icon"><Banknote size={18}/></span></div><div className="profile-form-grid"><Field label="Liquid savings (₹)" hint="Money available to you; exclude locked investments."><input type="number" min="0" value={profile.liquidSavings} onChange={(event) => updateProfile('liquidSavings', Number(event.target.value))}/></Field><Field label="Monthly income (₹)"><input type="number" min="0" value={profile.incomeMonthly} onChange={(event) => updateProfile('incomeMonthly', Number(event.target.value))}/></Field><Field label="Essential monthly expenses (₹)"><input type="number" min="0" value={profile.essentialExpensesMonthly} onChange={(event) => updateProfile('essentialExpensesMonthly', Number(event.target.value))}/></Field><Field label="Monthly debt obligations (₹)"><input type="number" min="0" value={profile.debtMonthly} onChange={(event) => updateProfile('debtMonthly', Number(event.target.value))}/></Field><Field label="Upcoming expenses (₹)" hint="Essential bills or one-off costs you already expect."><input type="number" min="0" value={profile.upcomingExpenses} onChange={(event) => updateProfile('upcomingExpenses', Number(event.target.value))}/></Field><Field label="Emergency reserve target (₹)"><input type="number" min="0" value={profile.reserveTarget} onChange={(event) => updateProfile('reserveTarget', Number(event.target.value))}/></Field><Field label="Planned monthly savings (₹)"><input type="number" min="0" value={profile.monthlySavingsTarget} onChange={(event) => updateProfile('monthlySavingsTarget', Number(event.target.value))}/></Field><Field label="Days until next expected income" hint="The model prorates essential and debt costs until then."><input type="number" min="0" max="30" value={profile.nextIncomeInDays} onChange={(event) => updateProfile('nextIncomeInDays', Number(event.target.value))}/></Field></div><div className="profile-saved"><Check size={15}/> Saved on this device automatically <span>·</span> {isSample ? 'Example values' : 'Your edited values'}</div></Card>
            <div className="privacy-side"><Card><div className="card-heading"><div><div className="eyebrow">DATA & CONTROL</div><h3>Privacy, in plain language</h3></div><span className="card-icon"><LockKeyhole size={18}/></span></div><ul className="privacy-list"><li><Check size={15}/> No bank login or account credentials requested.</li><li><Check size={15}/> Financial inputs and offchain goals stay in this browser.</li><li><Check size={15}/> Optional AI explanations send the product name and calculated result to your configured server provider.</li><li><Check size={15}/> A vault deposit is public on Monad Testnet; only a hash of your goal label is written onchain.</li><li><Check size={15}/> Never enter or share a seed phrase or private key.</li></ul><div className="privacy-actions"><button className="button button-secondary" onClick={() => { Object.values(STORE).forEach((key) => localStorage.removeItem(key)); setProfile(SAMPLE_PROFILE); setIsSample(true); setGoals([]); setObservations([]); notify('Local demo data cleared.') }}><Trash2 size={15}/> Clear local profile and plans</button><span>Does not alter blockchain funds or transactions.</span></div></Card><Card className="settings-integrations"><div className="card-heading"><div><div className="eyebrow">INTEGRATIONS</div><h3>Optional services</h3></div><span className="card-icon"><ExternalLink size={17}/></span></div><div className="integration-row"><span className="integration-icon"><Sparkles size={16}/></span><div><strong>AI explanations</strong><small>Backend API key required · deterministic fallback is available</small></div><Badge tone="neutral">Optional</Badge></div><div className="integration-row"><span className="integration-icon"><BarChart3 size={16}/></span><div><strong>Live price provider</strong><small>Not configured · manual observations are available</small></div><Badge tone="amber">Manual only</Badge></div><div className="integration-row"><span className="integration-icon"><Wallet size={16}/></span><div><strong>Monad Testnet vault</strong><small>{TESTNET.contract ? 'Contract address is configured' : 'Contract deployment pending'}</small></div><Badge tone={TESTNET.contract ? 'green' : 'amber'}>{TESTNET.contract ? 'Configured' : 'Pending'}</Badge></div></Card></div>
          </div>
        </>}

        {view === 'help' && <>
          <PageHeading eyebrow="HELP & EXPLANATIONS" title="Know what is behind every number." description="WAITWISE makes estimates from the inputs you provide. Here is what it does, what it does not know, and what it stores." />
          <div className="help-grid"><Card className="help-method"><div className="card-heading"><div><div className="eyebrow">DECISION METHOD</div><h3>How Buy / Wait is calculated</h3></div><span className="card-icon"><Activity size={18}/></span></div><p>WAITWISE reserves your listed upcoming expenses, then prorates essential expenses and debt until the next expected income. It subtracts the product price, checks the monthly budget after your planned savings, and compares the remaining cash with your reserve target.</p><ol><li>If the near-term cash estimate goes below zero, the result is <strong>Don’t buy yet</strong>.</li><li>If monthly commitments exceed income, the result is <strong>Don’t buy yet</strong>.</li><li>If key values are missing, the result is a cautious <strong>Wait</strong>.</li><li>If the purchase would dip below your reserve, it is <strong>Wait</strong> when a positive surplus can rebuild the buffer, or <strong>Don’t buy yet</strong> otherwise.</li><li>It shows <strong>Buy now</strong> only when the entered obligations and reserve remain covered.</li></ol><div className="formula-box">monthly surplus = income − essential expenses − debt − planned savings</div></Card><Card><div className="card-heading"><div><div className="eyebrow">SCORE FORMULA</div><h3>Four visible parts, 100 points max</h3></div><span className="card-icon"><ShieldCheck size={18}/></span></div><div className="help-formula-list"><div><strong>30</strong><span>Reserve adequacy<br/><small>up to 30 × (savings − upcoming) ÷ reserve target</small></span></div><div><strong>25</strong><span>Monthly budget<br/><small>25 × surplus ÷ income ÷ 20%, capped at 25</small></span></div><div><strong>25</strong><span>Purchase affordability<br/><small>25 × post-obligation, post-reserve headroom ÷ price</small></span></div><div><strong>20</strong><span>Goal progress<br/><small>20 × total saved toward goals ÷ total goal targets</small></span></div></div><p className="muted-copy">Each component is capped at its maximum and at zero. Missing information lowers completeness and is called out. This is an internal educational indicator, not a credit score or regulated assessment.</p></Card><Card><div className="card-heading"><div><div className="eyebrow">PRICE & SAVING</div><h3>What the app can’t know for you</h3></div><span className="card-icon"><Info size={18}/></span></div><ul className="help-bullets"><li>Future product prices, your future income, and unexpected expenses are unknown.</li><li>Price history only includes manual observations you entered; no scraping is used.</li><li>Goal dates assume the monthly contribution you choose continues, without returns.</li><li>EMI estimates use the rate and fees entered; they are not a lender offer.</li><li>Rupee goals are offchain plans. The vault uses testnet MON with no real-world value.</li></ul></Card><Card><div className="card-heading"><div><div className="eyebrow">DATA HANDLING</div><h3>Where information goes</h3></div><span className="card-icon"><LockKeyhole size={18}/></span></div><ul className="help-bullets"><li>Financial profile, goals, and manual observations are stored in local browser storage.</li><li>There is no sign-in, bank integration, or shared database.</li><li>If the AI provider is configured, the server receives only the product name, the question, and the calculated result when you press “Explain.”</li><li>Blockchain transactions, addresses, and amounts are public on the selected testnet.</li><li>Use the profile settings to clear local demo data. Clearing app data does not affect onchain funds.</li></ul><button className="text-button" onClick={() => setView('settings')}>Open profile & privacy <ArrowRight size={14}/></button></Card></div>
        </>}
        <footer className="page-footer"><span>WAITWISE AI <span className="footer-dot">·</span> Buy smarter. Stress less.</span><span>Estimates for education. No guaranteed savings, price drops, or returns.</span><button onClick={() => setView('help')}>How estimates work</button></footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">{[{ id: 'home' as const, label: 'Overview', icon: Home }, { id: 'decision' as const, label: 'Buy / wait', icon: Activity }, { id: 'simulator' as const, label: 'Compare', icon: BarChart3 }, { id: 'goals' as const, label: 'Goals', icon: Target }, { id: 'vault' as const, label: 'Vault', icon: Wallet }].map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}><Icon/><span>{label}</span></button>)}</nav>
    </div>
    {toast && <div className="toast" role="status"><Check size={15}/>{toast}</div>}
  </div>
}

function GoalProgress({ goal, onRemove, onContributionChange, compact = false }: { goal: SavingsGoal; onRemove: () => void; onContributionChange?: (value: number) => void; compact?: boolean }) {
  const projection = getGoalProjection(goal)
  return <div className={cx('goal-card', compact && 'goal-card-compact')}><div className="goal-card-top"><div><div className="goal-name"><span className="goal-symbol"><Target size={15}/></span><strong>{goal.name}</strong></div><small>{money(projection.remaining)} left to target</small></div><button className="icon-button subtle-danger" onClick={onRemove} aria-label={`Remove ${goal.name} savings plan`}><Trash2 size={15}/></button></div><div className="goal-amount-row"><strong>{money(goal.current)}</strong><span>of {money(goal.target)}</span><Badge tone={projection.targetIsImpossible ? 'amber' : 'green'}>{Math.round(projection.progress)}%</Badge></div><div className="goal-progress-track"><span style={{ width: `${projection.progress}%` }}/></div><div className="goal-card-bottom"><span>Target: {new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>{projection.estimatedDate ? `Estimated: ${new Date(`${projection.estimatedDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Set a contribution to estimate'}</span></div>{projection.targetIsImpossible && <div className="goal-warning"><AlertCircle size={14}/> At this contribution, the target date may be too soon. Change the date or contribution.</div>}{!compact && <div className="goal-contribution-row"><Field label="Monthly contribution (₹)"><input type="number" min="0" value={goal.monthlyContribution} onChange={(event) => onContributionChange?.(Number(event.target.value))}/></Field><span>Starting amount {money(goal.current)} · editable only in this plan</span></div>}</div>
}

function OnchainGoal({ goal, labels, owner, explorer, onDeposit, onWithdraw, onCancel }: { goal: ChainGoal; labels: Record<string, string>; owner: string; explorer: string; onDeposit: () => void; onWithdraw: () => void; onCancel: () => void }) {
  const label = labels[`${owner.toLowerCase()}:${goal.id}`] || `Vault goal ${goal.id}`
  const statusLabel = ['Active', 'Completed', 'Cancelled', 'Deadline reached'][goal.status] || 'Unknown'
  const withdrawable = goal.status !== 0
  return <Card className="chain-goal-card"><div className="chain-goal-top"><div><div className="eyebrow">ONCHAIN GOAL #{goal.id.toString()}</div><h3>{label}</h3></div><Badge tone={goal.status === 0 ? 'amber' : 'green'}>{statusLabel}</Badge></div><div className="chain-goal-stats"><div><span>Deposited balance</span><strong>{formatNumber(Number(formatEther(goal.balance)), 4)} MON</strong></div><div><span>Target amount</span><strong>{formatNumber(Number(formatEther(goal.target)), 4)} MON</strong></div><div><span>Recovery date</span><strong>{goal.deadline === 0n ? 'Cancel or complete anytime' : new Date(Number(goal.deadline) * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div></div><div className="chain-goal-rule">{withdrawable ? 'Contract permits owner withdrawal now.' : 'Cancel, reach the target, or wait for the optional date to withdraw.'}</div><div className="chain-goal-actions">{goal.status === 0 && <><button className="button button-primary button-small" onClick={onDeposit}><Plus size={14}/> Add testnet MON</button><button className="button button-outline button-small" onClick={onCancel}>Cancel goal</button></>}{withdrawable && goal.balance > 0n && <button className="button button-secondary button-small" onClick={onWithdraw}><ArrowDownRight size={15}/> Withdraw available funds</button>}<a href={`${explorer}/address/${owner}`} target="_blank" rel="noreferrer" className="text-button">View wallet <ExternalLink size={13}/></a></div><details className="advanced-details"><summary>Goal reference details</summary><p>Owner: {owner}<br/>Reference hash: {goal.reference}<br/>Funds are native MON held by the contract without yield. No administrator can withdraw them.</p></details></Card>
}
