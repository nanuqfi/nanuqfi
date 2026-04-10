/**
 * Fix Treasury USDC Mint Mismatch (B19 fix)
 *
 * The treasury was initialized with Circle's devnet USDC (4zMMC9...),
 * but vaults use the test mint (BiTXT15...). This script:
 * 1. Creates an ATA for the test USDC mint owned by allocator PDA
 * 2. Calls update_treasury_usdc to point treasury at the new ATA
 *
 * Usage: npx tsx scripts/fix-treasury-usdc.ts
 */

import { Program, AnchorProvider, Wallet, setProvider } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const TEST_USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')

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

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')],
  PROGRAM_ID,
)

const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')],
  PROGRAM_ID,
)

async function main() {
  console.log('=== Fix Treasury USDC Mint Mismatch ===\n')

  // Step 1: Check current treasury state
  const treasuryData = await program.account.treasury.fetch(treasuryPDA)
  console.log(`Current treasury USDC: ${(treasuryData.usdcTokenAccount as PublicKey).toBase58()}`)

  // Step 2: Create ATA for test USDC mint owned by allocator PDA
  console.log(`\nCreating ATA for test mint ${TEST_USDC_MINT.toBase58()}...`)
  const newTreasuryUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    TEST_USDC_MINT,
    allocatorPDA,
    true, // allowOwnerOffCurve for PDA
  )
  console.log(`New treasury USDC ATA: ${newTreasuryUsdc.address.toBase58()}`)

  // Step 3: Call update_treasury_usdc
  console.log('\nCalling update_treasury_usdc...')
  const tx = await program.methods
    .updateTreasuryUsdc()
    .accounts({
      allocator: allocatorPDA,
      treasury: treasuryPDA,
      newTreasuryUsdc: newTreasuryUsdc.address,
      admin: wallet.publicKey,
    })
    .rpc()

  console.log(`Success! tx: ${tx}`)

  // Step 4: Verify
  const updated = await program.account.treasury.fetch(treasuryPDA)
  const updatedAddr = (updated.usdcTokenAccount as PublicKey).toBase58()
  console.log(`\nVerified treasury USDC: ${updatedAddr}`)

  if (updatedAddr === newTreasuryUsdc.address.toBase58()) {
    console.log('Treasury USDC mint mismatch FIXED.')
  } else {
    console.error('ERROR: Treasury USDC not updated!')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Failed:', err.message)
  if (err.logs) err.logs.slice(-5).forEach((l: string) => console.log(`  ${l}`))
  process.exit(1)
})
