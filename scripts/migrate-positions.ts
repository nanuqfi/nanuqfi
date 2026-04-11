/**
 * Migrate UserPosition accounts from v0 (129 bytes) to v1 (130 bytes).
 * Usage: npx tsx scripts/migrate-positions.ts <USER_PUBKEY> <RISK_LEVEL>
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(resolve(process.env.HOME!, 'Documents/secret/solana-devnet.json'), 'utf-8'))),
)
const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const wallet = new Wallet(adminKeypair)
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
setProvider(provider)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const program = new Program(idl as any, provider)

const [allocatorPDA] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)

async function migratePosition(userPubkey: string, riskLevel: number) {
  const user = new PublicKey(userPubkey)
  const [riskVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), Buffer.from([riskLevel])], PROGRAM_ID,
  )
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), user.toBytes(), riskVault.toBytes()], PROGRAM_ID,
  )

  const info = await connection.getAccountInfo(positionPDA)
  if (!info) { console.log('Position not found'); return }
  console.log(`Position: ${positionPDA.toBase58()} — ${info.data.length} bytes`)

  if (info.data.length >= 130) {
    console.log('[skip] Already v1')
    return
  }

  const tx = await program.methods
    .adminMigrateUserPosition()
    .accounts({
      userPosition: positionPDA,
      allocator: allocatorPDA,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  const after = await connection.getAccountInfo(positionPDA)
  console.log(`[done] Migrated to ${after!.data.length} bytes — tx: ${tx}`)
}

// Migrate all risk levels for the given user
const userPubkey = process.argv[2]
if (!userPubkey) {
  console.error('Usage: npx tsx scripts/migrate-positions.ts <USER_PUBKEY> [RISK_LEVEL]')
  process.exit(1)
}

const riskLevel = process.argv[3] ? parseInt(process.argv[3]) : undefined

async function main() {
  console.log(`\nMigrating positions for ${userPubkey}\n`)
  const levels = riskLevel !== undefined ? [riskLevel] : [0, 1, 2]
  for (const rl of levels) {
    const name = ['Conservative', 'Moderate', 'Aggressive'][rl]
    console.log(`${name} (risk_level=${rl}):`)
    await migratePosition(userPubkey!, rl)
    console.log()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message || err)
  if (err.logs) err.logs.forEach((l: string) => console.error('  ', l))
  process.exit(1)
})
