/**
 * NanuqFi Devnet Setup Script
 *
 * Initializes allocator program accounts on Solana devnet:
 * 1. Allocator (singleton PDA)
 * 2. Treasury + treasury USDC token account
 * 3. Moderate vault (risk_level=1) + share mint
 * 4. Aggressive vault (risk_level=2) + share mint
 *
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/setup-devnet.ts
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
const BN = anchor.default?.BN ?? anchor.BN ?? (await import('bn.js')).default
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

// ─── Constants ─────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const KEEPER_AUTHORITY = new PublicKey('2xRNkCNNbEhr7iDsUdZ252LvAtcHFXUNmpSAM7ad6eyk')

// NanuqFi test USDC mint (admin is mint authority — can mint freely for testing)
// Note: Program treasury was switched from Circle's devnet USDC to this custom mint
// via update_treasury_usdc instruction during Phase B testing.
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')

// ─── PDA Derivation ────────────────────────────────────────────────────────

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')],
  PROGRAM_ID,
)

const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')],
  PROGRAM_ID,
)

function getRiskVaultPDA(riskLevel: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), Buffer.from([riskLevel])],
    PROGRAM_ID,
  )
}

function getShareMintPDA(riskLevel: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('share_mint'), Buffer.from([riskLevel])],
    PROGRAM_ID,
  )
}

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
const program = new Program(idl as any, provider)

// ─── Helpers ───────────────────────────────────────────────────────────────

async function accountExists(pubkey: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey)
  return info !== null
}

function riskLevelName(level: number): string {
  return ['Conservative', 'Moderate', 'Aggressive'][level] ?? `Unknown(${level})`
}

// Anchor enum format for RiskLevel
function riskLevelEnum(level: number): object {
  const variants: Record<number, object> = {
    0: { conservative: {} },
    1: { moderate: {} },
    2: { aggressive: {} },
  }
  return variants[level]!
}

// ─── Step 1: Initialize Allocator ──────────────────────────────────────────

async function initAllocator(): Promise<void> {
  if (await accountExists(allocatorPDA)) {
    console.log('  [skip] Allocator already initialized')
    return
  }

  console.log('  Initializing allocator...')
  const tx = await program.methods
    .initializeAllocator()
    .accounts({
      allocator: allocatorPDA,
      admin: wallet.publicKey,
      keeperAuthority: KEEPER_AUTHORITY,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`  [done] Allocator initialized — tx: ${tx}`)
}

// ─── Step 2: Initialize Treasury ───────────────────────────────────────────

async function initTreasury(): Promise<PublicKey> {
  // Treasury needs a USDC token account owned by the allocator PDA
  // We create it deterministically so re-runs find the same account
  let treasuryUsdcAccount: PublicKey

  if (await accountExists(treasuryPDA)) {
    console.log('  [skip] Treasury already initialized')
    // Fetch stored treasury USDC account
    const treasuryData = await program.account.treasury.fetch(treasuryPDA)
    return treasuryData.usdcTokenAccount as PublicKey
  }

  // Create treasury USDC token account (ATA owned by allocator PDA)
  console.log('  Creating treasury USDC token account...')
  const treasuryUsdcAta = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,       // payer
    USDC_MINT,          // mint
    allocatorPDA,       // owner (allocator PDA controls it)
    true,               // allowOwnerOffCurve — required for PDA owners
  )
  treasuryUsdcAccount = treasuryUsdcAta.address
  console.log(`  [done] Treasury USDC account: ${treasuryUsdcAccount}`)

  console.log('  Initializing treasury...')
  const tx = await program.methods
    .initializeTreasury()
    .accounts({
      treasury: treasuryPDA,
      allocator: allocatorPDA,
      admin: wallet.publicKey,
      treasuryUsdc: treasuryUsdcAccount,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`  [done] Treasury initialized — tx: ${tx}`)
  return treasuryUsdcAccount
}

// ─── Step 3: Initialize Risk Vault ─────────────────────────────────────────

interface VaultConfig {
  riskLevel: number
  maxPerpBps: number
  maxLendingBps: number
  maxSingleAssetBps: number
  maxDrawdownBps: number
  maxLeverageBps: number
  redemptionPeriodSlots: number
  depositCap: number
}

async function initRiskVault(config: VaultConfig): Promise<void> {
  const [vaultPDA] = getRiskVaultPDA(config.riskLevel)
  const name = riskLevelName(config.riskLevel)

  if (await accountExists(vaultPDA)) {
    console.log(`  [skip] ${name} vault already initialized`)
    return
  }

  // Create share mint with allocator PDA as mint authority
  // 6 decimals to match USDC
  console.log(`  Creating ${name} share mint...`)
  const shareMint = await createMint(
    connection,
    adminKeypair,       // payer
    allocatorPDA,       // mint authority (allocator PDA)
    null,               // freeze authority (none)
    6,                  // decimals (match USDC)
  )
  console.log(`  [done] ${name} share mint: ${shareMint}`)

  console.log(`  Initializing ${name} vault...`)
  const tx = await program.methods
    .initializeRiskVault(
      riskLevelEnum(config.riskLevel),
      config.maxPerpBps,
      config.maxLendingBps,
      config.maxSingleAssetBps,
      config.maxDrawdownBps,
      config.maxLeverageBps,
      new BN(config.redemptionPeriodSlots),
      new BN(config.depositCap),
    )
    .accounts({
      riskVault: vaultPDA,
      allocator: allocatorPDA,
      admin: wallet.publicKey,
      protocolVault: PublicKey.default,
      shareMint: shareMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`  [done] ${name} vault initialized — tx: ${tx}`)
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('')
  console.log('NanuqFi Devnet Setup')
  console.log('====================')
  console.log(`  Program:  ${PROGRAM_ID}`)
  console.log(`  Admin:    ${wallet.publicKey}`)
  console.log(`  Keeper:   ${KEEPER_AUTHORITY}`)
  console.log(`  Network:  devnet`)

  // Check admin balance
  const balance = await connection.getBalance(wallet.publicKey)
  const solBalance = balance / 1e9
  console.log(`  Balance:  ${solBalance.toFixed(4)} SOL`)

  if (solBalance < 0.05) {
    console.error('\n  ERROR: Insufficient SOL balance. Need at least 0.05 SOL for rent + fees.')
    console.error('  Fund the wallet: solana airdrop 2 --url devnet')
    process.exit(1)
  }

  // Step 1: Allocator
  console.log('\n1. Allocator')
  await initAllocator()

  // Step 2: Treasury
  console.log('\n2. Treasury')
  let treasuryUsdc: PublicKey
  try {
    treasuryUsdc = await initTreasury()
  } catch (err) {
    console.log(`  [warn] Treasury fetch failed (${err instanceof Error ? err.message : err}), continuing...`)
    // Treasury already exists, derive the expected USDC ATA
    const { getAssociatedTokenAddress } = await import('@solana/spl-token')
    treasuryUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)
    console.log(`  [fallback] Treasury USDC ATA: ${treasuryUsdc}`)
  }

  // Step 3: Conservative Vault (risk_level=0)
  console.log('\n3. Conservative Vault')
  await initRiskVault({
    riskLevel: 0,
    maxPerpBps: 0,                 // 0% — no perp exposure
    maxLendingBps: 10000,          // 100% — lending only
    maxSingleAssetBps: 7000,       // 70% — allow concentrated safe positions
    maxDrawdownBps: 200,           // 2%
    maxLeverageBps: 10000,         // 1x (no leverage)
    redemptionPeriodSlots: 172800, // ~1 day at 2 slots/sec
    depositCap: 100_000_000,       // 100 USDC (6 decimals)
  })

  // Step 4: Moderate Vault (risk_level=1)
  console.log('\n4. Moderate Vault')
  await initRiskVault({
    riskLevel: 1,
    maxPerpBps: 6000,             // 60%
    maxLendingBps: 4000,          // 40%
    maxSingleAssetBps: 2000,      // 20%
    maxDrawdownBps: 500,          // 5%
    maxLeverageBps: 10000,        // 1x (no leverage cap)
    redemptionPeriodSlots: 345600, // ~2 days at 2 slots/sec
    depositCap: 100_000_000,      // 100 USDC (6 decimals)
  })

  // Step 5: Aggressive Vault (risk_level=2)
  console.log('\n5. Aggressive Vault')
  await initRiskVault({
    riskLevel: 2,
    maxPerpBps: 7000,             // 70%
    maxLendingBps: 3000,          // 30%
    maxSingleAssetBps: 3000,      // 30%
    maxDrawdownBps: 1000,         // 10%
    maxLeverageBps: 30000,        // 3x
    redemptionPeriodSlots: 518400, // ~3 days at 2 slots/sec
    depositCap: 100_000_000,      // 100 USDC (6 decimals)
  })

  // Summary
  const [conservativeVaultPDA] = getRiskVaultPDA(0)
  const [moderateVaultPDA] = getRiskVaultPDA(1)
  const [aggressiveVaultPDA] = getRiskVaultPDA(2)

  console.log('\n' + '='.repeat(52))
  console.log('Setup Complete')
  console.log('='.repeat(52))
  console.log(`  Allocator PDA:         ${allocatorPDA}`)
  console.log(`  Treasury PDA:          ${treasuryPDA}`)
  console.log(`  Conservative Vault:    ${conservativeVaultPDA}`)
  console.log(`  Moderate Vault PDA:    ${moderateVaultPDA}`)
  console.log(`  Aggressive Vault:      ${aggressiveVaultPDA}`)
  console.log('')
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message || err)
  if (err.logs) {
    console.error('\nProgram logs:')
    err.logs.forEach((log: string) => console.error(`  ${log}`))
  }
  process.exit(1)
})
