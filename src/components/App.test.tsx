import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App, { DecisionPanel, PurchaseForm, TransactionStatus, WalletConnectionState } from '../App'
import { calculateDecision } from '../lib/finance'

const profile = { liquidSavings: 120_000, incomeMonthly: 50_000, essentialExpensesMonthly: 20_000, debtMonthly: 2_000, upcomingExpenses: 5_000, reserveTarget: 25_000, monthlySavingsTarget: 5_000, nextIncomeInDays: 15 }
const purchase = { name: 'Laptop', category: 'Laptop', price: 50_000, urgency: 'normal' as const }
const result = calculateDecision(profile, purchase, new Date('2026-01-01T00:00:00Z'))

afterEach(() => { cleanup(); localStorage.clear() })

describe('purchase and recommendation UI', () => {
  it('offers both a sample tour and a personal profile setup', () => {
    render(<App/> )
    expect(screen.getByText('A calmer way to think through a big purchase.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /explore example/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set up my profile/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /explore example/i }))
    expect(screen.getByText('Keep the whole month in view')).toBeInTheDocument()
    expect(screen.getByText('Example profile.')).toBeInTheDocument()
  })

  it('renders validated purchase fields and submits a valid product', () => {
    const setPurchase = vi.fn()
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(<PurchaseForm purchase={purchase} setPurchase={setPurchase} onSubmit={onSubmit}/> )
    expect(screen.getByLabelText('Product name')).toBeRequired()
    expect(screen.getByLabelText('Product price')).toHaveAttribute('min', '1')
    fireEvent.click(screen.getByRole('button', { name: /check my timing/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('shows the deterministic recommendation, breakdown, and assumptions', () => {
    render(<DecisionPanel result={result} purchase={purchase} onExplain={() => {}} explaining={false} aiExplanation="" aiUnavailable={false}/> )
    expect(screen.getByText('BUY NOW')).toBeInTheDocument()
    expect(screen.getByText(result.reason)).toBeInTheDocument()
    expect(screen.getByText('The inputs behind your result')).toBeInTheDocument()
    expect(screen.getByText(/No investment returns or future price changes/)).toBeInTheDocument()
  })

  it('disables explanation while loading and identifies deterministic fallback', () => {
    const { rerender } = render(<DecisionPanel result={result} purchase={purchase} onExplain={() => {}} explaining aiExplanation="" aiUnavailable={false}/> )
    expect(screen.getByRole('button', { name: /getting explanation/i })).toBeDisabled()
    rerender(<DecisionPanel result={result} purchase={purchase} onExplain={() => {}} explaining={false} aiExplanation="The reserve remains covered." aiUnavailable/> )
    expect(screen.getByText('Deterministic explanation')).toBeInTheDocument()
    expect(screen.getByText('The reserve remains covered.')).toBeInTheDocument()
  })

  it('updates what-if alternatives when values change', () => {
    render(<App/> )
    fireEvent.click(screen.getByRole('button', { name: 'What-if planner' }))
    const alternative = screen.getByLabelText('Cheaper alternative price (₹)')
    fireEvent.change(alternative, { target: { value: '10000' } })
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
    expect(screen.getAllByText(/Cheaper alternative/).length).toBeGreaterThan(0)
  })
})

describe('wallet and transaction states', () => {
  it('shows disconnected, wrong-network, and connected wallet states', () => {
    const { rerender } = render(<WalletConnectionState address="" wrongNetwork={false}/> )
    expect(screen.getByText('Wallet not connected')).toBeInTheDocument()
    rerender(<WalletConnectionState address="0x1234567890123456789012345678901234567890" wrongNetwork/> )
    expect(screen.getByText('Connected · switch to Monad Testnet')).toBeInTheDocument()
    rerender(<WalletConnectionState address="0x1234567890123456789012345678901234567890" wrongNetwork={false}/> )
    expect(screen.getByText('Connected · Monad Testnet')).toBeInTheDocument()
  })

  it('distinguishes submitted, pending, confirmed, and failed transactions', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<TransactionStatus status="submitted" message="Waiting for wallet" hash="" explorer="https://testnet.monadvision.com" onDismiss={onDismiss}/> )
    expect(screen.getByText('TRANSACTION SUBMITTED')).toBeInTheDocument()
    rerender(<TransactionStatus status="pending" message="Waiting for confirmation" hash="0xabc" explorer="https://testnet.monadvision.com" onDismiss={onDismiss}/> )
    expect(screen.getByText('TRANSACTION PENDING')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute('href', 'https://testnet.monadvision.com/tx/0xabc')
    rerender(<TransactionStatus status="confirmed" message="Confirmed" hash="0xabc" explorer="https://testnet.monadvision.com" onDismiss={onDismiss}/> )
    expect(screen.getByText('TRANSACTION CONFIRMED')).toBeInTheDocument()
    rerender(<TransactionStatus status="failed" message="Rejected by wallet" hash="" explorer="https://testnet.monadvision.com" onDismiss={onDismiss}/> )
    expect(screen.getByText('TRANSACTION FAILED')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss transaction status' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
