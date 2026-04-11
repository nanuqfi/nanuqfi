/**
 * NanuqFi Account Migration Script (v0 → v1)
 *
 * Migrates Allocator and Treasury accounts from v0 layout
 * (no version field, no whitelist/fees_withdrawn) to v1.
 *
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/migrate-v1.ts
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')

// ─── Setup ────────────────────────────────────────────────────────────

const keypairPath = resolve(process.env.ADMIN_KEYPAIR ?? `${process.env.HOME}/Documents/secret/solana-devnet.json`)
const adminKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf-8')))
)
const wallet = new Wallet(adminKeypair)
const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
setProvider(provider)

const program = new Program(idl as anchor.Idl, provider)

// ─── PDAs ─────────────────────────────────────────────────────────────

const [allocatorPDA] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)
const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID)

// ─── Migration ────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('NanuqFi Account Migration (v0 → v1)')
  console.log('====================================')
  console.log(`  Program:    ${PROGRAM_ID}`)
  console.log(`  Admin:      ${wallet.publicKey}`)
  console.log(`  Allocator:  ${allocatorPDA}`)
  console.log(`  Treasury:   ${treasuryPDA}`)

  // Check current sizes
  const allocatorInfo = await connection.getAccountInfo(allocatorPDA)
  const treasuryInfo = await connection.getAccountInfo(treasuryPDA)
  console.log(`\n  Allocator size: ${allocatorInfo?.data.length ?? 'NOT FOUND'} bytes`)
  console.log(`  Treasury size:  ${treasuryInfo?.data.length ?? 'NOT FOUND'} bytes`)

  // Step 1: Migrate Allocator
  console.log('\n1. Migrating Allocator...')
  try {
    const tx1 = await program.methods
      .adminMigrateAllocator()
      .accounts({
        allocator: allocatorPDA,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
    console.log(`  [done] tx: ${tx1}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('already migrated')) {
      console.log('  [skip] Already migrated')
    } else {
      throw err
    }
  }

  // Step 2: Migrate Treasury
  console.log('\n2. Migrating Treasury...')
  try {
    const tx2 = await program.methods
      .adminMigrateTreasury()
      .accounts({
        treasury: treasuryPDA,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
    console.log(`  [done] tx: ${tx2}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('already migrated')) {
      console.log('  [skip] Already migrated')
    } else {
      throw err
    }
  }

  // Verify
  const newAllocator = await connection.getAccountInfo(allocatorPDA)
  const newTreasury = await connection.getAccountInfo(treasuryPDA)
  console.log(`\n  Allocator new size: ${newAllocator?.data.length} bytes`)
  console.log(`  Treasury new size:  ${newTreasury?.data.length} bytes`)
  console.log('\nMigration complete!')
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message || err)
  process.exit(1)
})
