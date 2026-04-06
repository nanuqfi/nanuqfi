/**
 * @deprecated Drift Protocol was removed from NanuqFi on 2026-04-05 after the
 * $285M Drift hack. This script is no longer functional and will be removed.
 *
 * NanuqFi Drift User Setup Script (DEPRECATED)
 *
 * Initializes a Drift Protocol User account for the allocator PDA via CPI.
 * This is a one-time setup that must run AFTER setup-devnet.ts.
 *
 * What it does:
 * 1. Derives the allocator PDA, Drift User PDA, and Drift UserStats PDA
 * 2. Calls `initialize_drift_account` on our allocator program
 *    - This CPIs into Drift's `initialize_user_stats` and `initialize_user`
 *    - The allocator PDA becomes the "authority" on the Drift User
 * 3. Verifies the accounts were created
 *
 * Prerequisites:
 * - Allocator must be initialized (run setup-devnet.ts first)
 * - Admin wallet must have SOL for rent (~0.03 SOL)
 * - Allocator program must be deployed with initialize_drift_account instruction
 *
 * Usage: npx tsx scripts/setup-drift-user.ts
 */

import { Program, AnchorProvider, Wallet, setProvider } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

// ─── Constants ─────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const DRIFT_PROGRAM_ID = new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH')
const DRIFT_STATE = new PublicKey('5zpq7DvB6UdFFvpmBPspGPNfUGoBRRCE2HHg5u3gxcsN')

// Sub-account ID for the allocator's Drift User (0 = primary)
const SUB_ACCOUNT_ID = 0

// ─── PDA Derivation ────────────────────────────────────────────────────────

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')],
  PROGRAM_ID,
)

// Drift UserStats PDA: seeds = ["user_stats", authority]
const [driftUserStatsPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('user_stats'), allocatorPDA.toBuffer()],
  DRIFT_PROGRAM_ID,
)

// Drift User PDA: seeds = ["user", authority, sub_account_id (u16 LE)]
const subAccountIdBuffer = Buffer.alloc(2)
subAccountIdBuffer.writeUInt16LE(SUB_ACCOUNT_ID)

const [driftUserPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('user'), allocatorPDA.toBuffer(), subAccountIdBuffer],
  DRIFT_PROGRAM_ID,
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
const program = new Program(idl as any, provider)

// ─── Helpers ───────────────────────────────────────────────────────────────

async function accountExists(pubkey: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey)
  return info !== null
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('')
  console.log('NanuqFi Drift User Setup')
  console.log('========================')
  console.log(`  Program:          ${PROGRAM_ID}`)
  console.log(`  Drift Program:    ${DRIFT_PROGRAM_ID}`)
  console.log(`  Allocator PDA:    ${allocatorPDA}`)
  console.log(`  Drift User PDA:   ${driftUserPDA}`)
  console.log(`  Drift Stats PDA:  ${driftUserStatsPDA}`)
  console.log(`  Admin:            ${wallet.publicKey}`)
  console.log(`  Sub-Account:      ${SUB_ACCOUNT_ID}`)

  // Pre-flight checks
  const balance = await connection.getBalance(wallet.publicKey)
  const solBalance = balance / 1e9
  console.log(`  Balance:          ${solBalance.toFixed(4)} SOL`)

  if (solBalance < 0.03) {
    console.error('\n  ERROR: Need at least 0.03 SOL for Drift account rent.')
    process.exit(1)
  }

  // Check allocator exists
  if (!(await accountExists(allocatorPDA))) {
    console.error('\n  ERROR: Allocator not initialized. Run setup-devnet.ts first.')
    process.exit(1)
  }
  console.log('\n  [ok] Allocator exists')

  // Check if Drift accounts already exist
  const userStatsExists = await accountExists(driftUserStatsPDA)
  const userExists = await accountExists(driftUserPDA)

  if (userStatsExists && userExists) {
    console.log('  [skip] Drift User and UserStats already initialized')
    console.log('\n  Done — nothing to do.')
    return
  }

  if (userStatsExists || userExists) {
    console.log(`  [warn] Partial state: UserStats=${userStatsExists}, User=${userExists}`)
    console.log('  This may indicate a previous failed attempt.')
    console.log('  The instruction will attempt to initialize missing accounts.')
  }

  // Call initialize_drift_account via our allocator program
  console.log('\n  Initializing Drift account via CPI...')
  console.log('  (This calls Drift\'s initialize_user_stats + initialize_user)')

  try {
    const tx = await program.methods
      .initializeDriftAccount(SUB_ACCOUNT_ID)
      .accounts({
        allocator: allocatorPDA,
        admin: wallet.publicKey,
        driftState: DRIFT_STATE,
        driftUser: driftUserPDA,
        driftUserStats: driftUserStatsPDA,
        driftProgram: DRIFT_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    console.log(`  [done] Drift account initialized — tx: ${tx}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('\n  ERROR: Failed to initialize Drift account')
    console.error(`  ${err.message || err}`)
    if (err.logs) {
      console.error('\n  Program logs:')
      err.logs.forEach((log: string) => console.error(`    ${log}`))
    }
    process.exit(1)
  }

  // Verify
  console.log('\n  Verifying...')
  const statsOk = await accountExists(driftUserStatsPDA)
  const userOk = await accountExists(driftUserPDA)

  if (statsOk && userOk) {
    console.log('  [ok] Drift UserStats created')
    console.log('  [ok] Drift User created')
  } else {
    console.error('  [FAIL] Account verification failed')
    console.error(`    UserStats: ${statsOk}`)
    console.error(`    User: ${userOk}`)
    process.exit(1)
  }

  // Summary
  console.log('\n' + '='.repeat(52))
  console.log('Drift Setup Complete')
  console.log('='.repeat(52))
  console.log(`  Drift User:       ${driftUserPDA}`)
  console.log(`  Drift UserStats:  ${driftUserStatsPDA}`)
  console.log(`  Authority:        ${allocatorPDA} (allocator PDA)`)
  console.log(`  Sub-Account:      ${SUB_ACCOUNT_ID}`)
  console.log('')
  console.log('  Next steps:')
  console.log('  1. Set keeper as delegate on the Drift User (optional)')
  console.log('  2. Test allocate_to_drift with a small USDC amount')
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
