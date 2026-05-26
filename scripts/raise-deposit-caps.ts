/**
 * Raise deposit caps on all 3 risk vaults for devnet demo use.
 * Uses raw instruction encoding — no IDL required.
 *
 * Usage: npx tsx scripts/raise-deposit-caps.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const NEW_CAP_USDC = 10_000n
const NEW_CAP_UNITS = NEW_CAP_USDC * 1_000_000n

const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(resolve(process.env.HOME!, 'Documents/secret/solana-devnet.json'), 'utf-8'),
    ),
  ),
)
const connection = new Connection('https://api.devnet.solana.com', 'confirmed')

function discriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().slice(0, 8)
}

function u64LE(n: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(n, 0)
  return buf
}

const [allocatorPDA] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)

const names = ['Conservative', 'Moderate', 'Aggressive']

async function main() {
  console.log('\nDeposit Cap Raise')
  console.log('=================')
  console.log(`Target cap: $${NEW_CAP_USDC.toLocaleString()} per vault`)
  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}\n`)

  const disc = discriminator('update_deposit_cap')

  for (const riskLevel of [0, 1, 2]) {
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

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: allocatorPDA, isSigner: false, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.concat([disc, u64LE(NEW_CAP_UNITS)]),
    })

    const tx = new Transaction().add(ix)
    const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair], {
      commitment: 'confirmed',
    })
    console.log(`${name}: cap raised to $${NEW_CAP_USDC.toLocaleString()} — ${sig.slice(0, 20)}...`)
  }

  console.log('\nDone.\n')
}

main().catch((err) => {
  console.error('Raise failed:', err.message || err)
  if (err.logs) err.logs.forEach((l: string) => console.error('  ', l))
  process.exit(1)
})
