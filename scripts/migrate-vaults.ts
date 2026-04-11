/**
 * Migrate RiskVault accounts from v0 (212 bytes) to v1 (221 bytes).
 * Usage: npx tsx scripts/migrate-vaults.ts
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

const names = ['Conservative', 'Moderate', 'Aggressive']

async function main() {
  console.log('\nRiskVault Migration (v0 → v1)')
  console.log('=============================\n')

  for (const riskLevel of [1, 2]) {
    const name = names[riskLevel]
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), Buffer.from([riskLevel])],
      PROGRAM_ID,
    )

    const info = await connection.getAccountInfo(vaultPDA)
    if (!info) {
      console.log(`${name}: account not found, skipping`)
      continue
    }
    console.log(`${name} vault: ${info.data.length} bytes`)

    if (info.data.length >= 221) {
      console.log('  [skip] Already v1\n')
      continue
    }

    const tx = await program.methods
      .adminMigrateRiskVault()
      .accounts({
        riskVault: vaultPDA,
        allocator: allocatorPDA,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    const after = await connection.getAccountInfo(vaultPDA)
    console.log(`  [done] Migrated to ${after!.data.length} bytes — tx: ${tx}\n`)
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message || err)
  if (err.logs) err.logs.forEach((l: string) => console.error('  ', l))
  process.exit(1)
})
