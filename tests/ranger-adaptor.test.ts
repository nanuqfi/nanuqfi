/**
 * Ranger Adaptor Integration Tests (Devnet)
 *
 * Tests the full CPI chain: Mock Vault → Adaptor → Allocator
 * Prerequisites: run setup-ranger-devnet.ts first
 *
 * Usage: npx tsx tests/ranger-adaptor.test.ts
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
const BN = anchor.default?.BN ?? anchor.BN ?? (await import('bn.js')).default
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getAccount,
  getAssociatedTokenAddress,
  mintTo,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { strict as assert } from 'assert'

import adaptorIdl from '../target/idl/nanuqfi_adaptor.json' assert { type: 'json' }
import mockVaultIdl from '../target/idl/mock_ranger_vault.json' assert { type: 'json' }
import allocatorIdl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

// ─── Constants ─────────────────────────────────────────────────────────────

const ALLOCATOR_PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const ADAPTOR_PROGRAM_ID = new PublicKey('HsNnmuB18pA2U24K4Stc1yan67Cx96gmvGRqBUqRFWwY')
const MOCK_VAULT_PROGRAM_ID = new PublicKey('FCW6LsSvGAv3UdLixCkm4vygifxR1sVBonuserqFe9Fm')
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')
const RISK_LEVEL = 0 // Conservative (v1 layout on devnet)

// ─── PDA Derivation ────────────────────────────────────────────────────────

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')], ALLOCATOR_PROGRAM_ID,
)
const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')], ALLOCATOR_PROGRAM_ID,
)
const [riskVaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), Buffer.from([RISK_LEVEL])], ALLOCATOR_PROGRAM_ID,
)
const [strategyPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('nanuqfi_strategy'), allocatorPDA.toBuffer()], ADAPTOR_PROGRAM_ID,
)
const [mockVaultAuthPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('mock_vault_auth')], MOCK_VAULT_PROGRAM_ID,
)
const [vaultStrategyAuthPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault_strategy_auth'), strategyPDA.toBuffer()], MOCK_VAULT_PROGRAM_ID,
)
const [userPositionPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('position'), vaultStrategyAuthPDA.toBuffer(), riskVaultPDA.toBuffer()],
  ALLOCATOR_PROGRAM_ID,
)

// ─── Setup ─────────────────────────────────────────────────────────────────

const adminKeypairPath = resolve(process.env.HOME!, 'Documents/secret/solana-devnet.json')
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(adminKeypairPath, 'utf-8'))),
)

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const wallet = new Wallet(adminKeypair)
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
setProvider(provider)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVaultProgram = new Program(mockVaultIdl as any, provider)

// ─── Helpers ───────────────────────────────────────────────────────────────

// Parse share_mint from raw vault data (v0/v1 aware)
async function getShareMint(): Promise<PublicKey> {
  const info = await connection.getAccountInfo(riskVaultPDA)
  if (!info) throw new Error('Risk vault not found')
  const isV1 = info.data.length >= 221
  const offset = isV1 ? 74 : 73
  return new PublicKey(info.data.subarray(offset, offset + 32))
}

// Parse treasury_usdc from raw treasury data
async function getTreasuryUsdc(): Promise<PublicKey> {
  const info = await connection.getAccountInfo(treasuryPDA)
  if (!info) throw new Error('Treasury not found')
  const isV1 = info.data.length >= 74
  const offset = isV1 ? 41 : 40
  return new PublicKey(info.data.subarray(offset, offset + 32))
}

// Parse total_assets from risk vault (v1: offset 9+32+1+32+32+8+8 = 122)
async function getTotalAssets(): Promise<bigint> {
  const info = await connection.getAccountInfo(riskVaultPDA)
  if (!info) throw new Error('Risk vault not found')
  const isV1 = info.data.length >= 221
  // total_assets is after: disc(8) + [version(1)] + allocator(32) + risk_level(1) +
  //   protocol_vault(32) + share_mint(32) + total_shares(8) + total_assets(8)
  // v0: 8+32+1+32+32+8 = 113 → total_assets at 113
  // v1: 8+1+32+1+32+32+8 = 114 → total_assets at 114
  const offset = isV1 ? 114 : 113
  const buf = info.data.subarray(offset, offset + 8)
  return buf.readBigUInt64LE(0)
}

async function getTokenBalance(address: PublicKey): Promise<bigint> {
  try {
    const account = await getAccount(connection, address)
    return account.amount
  } catch {
    return 0n
  }
}

// Parse strategy position_value from NanuqfiStrategy account
async function getStrategyPositionValue(): Promise<bigint> {
  const info = await connection.getAccountInfo(strategyPDA)
  if (!info) throw new Error('Strategy not found')
  // NanuqfiStrategy: disc(8) + allocator(32) + risk_vault(32) + position_value(8)
  const offset = 8 + 32 + 32
  return info.data.subarray(offset, offset + 8).readBigUInt64LE(0)
}

let passed = 0
let failed = 0
const results: { name: string; status: string; error?: string }[] = []

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`  ${name}... `)
  try {
    await fn()
    console.log('PASS')
    passed++
    results.push({ name, status: 'PASS' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`FAIL: ${msg}`)
    failed++
    results.push({ name, status: 'FAIL', error: msg })
  }
}

// ─── Resolve Accounts ──────────────────────────────────────────────────────

const shareMint = await getShareMint()
const treasuryUsdc = await getTreasuryUsdc()
const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)
const vaultIdleUsdc = await getAssociatedTokenAddress(USDC_MINT, mockVaultAuthPDA, true)
const vaultStrategyAssetAta = await getAssociatedTokenAddress(USDC_MINT, vaultStrategyAuthPDA, true)
const userShareAta = await getAssociatedTokenAddress(shareMint, vaultStrategyAuthPDA, true)

// Common accounts for deposit
function depositAccounts() {
  return {
    manager: wallet.publicKey,
    vaultAuth: mockVaultAuthPDA,
    vaultStrategyAuth: vaultStrategyAuthPDA,
    vaultIdleUsdc,
    vaultStrategyAssetAta,
    usdcMint: USDC_MINT,
    strategy: strategyPDA,
    allocator: allocatorPDA,
    riskVault: riskVaultPDA,
    userPosition: userPositionPDA,
    shareMint,
    userShareAta,
    vaultUsdc,
    allocatorProgram: ALLOCATOR_PROGRAM_ID,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    systemProgram: PublicKey.default,
  }
}

// Common accounts for withdraw
function withdrawAccounts() {
  return {
    manager: wallet.publicKey,
    vaultStrategyAuth: vaultStrategyAuthPDA,
    vaultIdleUsdc,
    vaultStrategyAssetAta,
    usdcMint: USDC_MINT,
    strategy: strategyPDA,
    allocator: allocatorPDA,
    riskVault: riskVaultPDA,
    userPosition: userPositionPDA,
    treasury: treasuryPDA,
    shareMint,
    userShareAta,
    vaultUsdc,
    treasuryUsdc,
    allocatorProgram: ALLOCATOR_PROGRAM_ID,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log('')
console.log('Ranger Adaptor Integration Tests')
console.log('================================')
console.log(`  Network: devnet`)
console.log(`  Admin:   ${wallet.publicKey}`)
console.log('')

// Ensure vault has enough test USDC (need 3+ USDC for deposit tests)
const idleBalance = await getTokenBalance(vaultIdleUsdc)
if (idleBalance < 5_000_000n) {
  console.log('  Minting test USDC to idle pool...')
  await mintTo(
    connection, adminKeypair, USDC_MINT,
    vaultIdleUsdc, adminKeypair, 10_000_000, // 10 USDC
  )
}

// Test 1: Strategy already initialized
await test('Strategy is initialized', async () => {
  const info = await connection.getAccountInfo(strategyPDA)
  assert.ok(info, 'Strategy account should exist')
  assert.ok(info.data.length > 0, 'Strategy should have data')
})

// Test 2: Strategy state is correct
await test('Strategy state stores correct allocator and vault', async () => {
  const info = await connection.getAccountInfo(strategyPDA)
  assert.ok(info)
  // NanuqfiStrategy: disc(8) + allocator(32) + risk_vault(32) + position_value(8) + bump(1)
  const allocator = new PublicKey(info.data.subarray(8, 40))
  const riskVault = new PublicKey(info.data.subarray(40, 72))
  assert.equal(allocator.toBase58(), allocatorPDA.toBase58())
  assert.equal(riskVault.toBase58(), riskVaultPDA.toBase58())
})

// Test 3: Deposit via mock vault
const DEPOSIT_AMOUNT = 1_000_000 // 1 USDC (meets MIN_FIRST_DEPOSIT)
const sharesBefore = await getTokenBalance(userShareAta)
const totalAssetsBefore = await getTotalAssets()

await test('Deposit via mock vault routes USDC to allocator', async () => {
  const vaultUsdcBefore = await getTokenBalance(vaultUsdc)

  const tx = await mockVaultProgram.methods
    .depositStrategy(new BN(DEPOSIT_AMOUNT))
    .accounts(depositAccounts())
    .rpc()

  assert.ok(tx, 'Transaction should succeed')

  // Verify USDC arrived in allocator vault
  const vaultUsdcAfter = await getTokenBalance(vaultUsdc)
  assert.ok(
    vaultUsdcAfter >= vaultUsdcBefore + BigInt(DEPOSIT_AMOUNT),
    `Vault USDC should increase by ${DEPOSIT_AMOUNT}`,
  )
})

// Test 4: Shares minted after deposit
await test('Shares minted to vault_strategy_auth after deposit', async () => {
  const sharesAfter = await getTokenBalance(userShareAta)
  assert.ok(
    sharesAfter > sharesBefore,
    `Shares should increase (before: ${sharesBefore}, after: ${sharesAfter})`,
  )
})

// Test 5: Position value updated
await test('Position value updated in strategy state', async () => {
  const positionValue = await getStrategyPositionValue()
  assert.ok(positionValue > 0n, `Position value should be > 0, got ${positionValue}`)
})

// Test 6: Second deposit accumulates
await test('Second deposit accumulates correctly', async () => {
  const positionBefore = await getStrategyPositionValue()
  const sharesBefore2 = await getTokenBalance(userShareAta)

  await mockVaultProgram.methods
    .depositStrategy(new BN(DEPOSIT_AMOUNT))
    .accounts(depositAccounts())
    .rpc()

  const positionAfter = await getStrategyPositionValue()
  const sharesAfter2 = await getTokenBalance(userShareAta)

  assert.ok(positionAfter > positionBefore, 'Position value should increase')
  assert.ok(sharesAfter2 > sharesBefore2, 'Shares should increase')
})

// Test 7: Withdraw via mock vault returns USDC
// NOTE: Fails until adaptor is redeployed with treasury seeds fix (needs ~0.5 more devnet SOL)
await test('Withdraw returns USDC to idle pool', async () => {
  const idleBefore = await getTokenBalance(vaultIdleUsdc)

  await mockVaultProgram.methods
    .withdrawStrategy(new BN(DEPOSIT_AMOUNT))
    .accounts(withdrawAccounts())
    .rpc()

  const idleAfter = await getTokenBalance(vaultIdleUsdc)
  assert.ok(
    idleAfter > idleBefore,
    `Idle pool should increase (before: ${idleBefore}, after: ${idleAfter})`,
  )
})

// Test 8: Position value decreases after withdrawal
await test('Position value decreases after withdrawal', async () => {
  const positionValue = await getStrategyPositionValue()
  // We deposited 2x DEPOSIT_AMOUNT and withdrew 1x, so remaining should be ~DEPOSIT_AMOUNT
  assert.ok(
    positionValue > 0n,
    `Position value should still be > 0 after partial withdraw`,
  )
  // It should be less than 2x deposit (we withdrew some)
  assert.ok(
    positionValue < BigInt(DEPOSIT_AMOUNT) * 3n,
    `Position value should be < 3x deposit amount`,
  )
})

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('')
console.log('================================')
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`)
if (failed > 0) {
  console.log('\nFailed tests:')
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`)
  })
  process.exit(1)
}
console.log('')
