/**
 * Seed Aggressive Vault with USDC deposit.
 * Usage: npx tsx scripts/seed-aggressive.ts
 */

import { Program, AnchorProvider, Wallet, BN, setProvider } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('CDhkMBnc43wJQyVaSrreXk2ojvQvZMWrAWNBLSjaRJxq')
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')
const DEPOSIT_AMOUNT = 50_000_000 // 50 USDC

const [allocatorPDA] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)

function getRiskVaultPDA(riskLevel: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), Buffer.from([riskLevel])],
    PROGRAM_ID,
  )[0]
}

function getUserPositionPDA(user: PublicKey, vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), user.toBuffer(), vault.toBuffer()],
    PROGRAM_ID,
  )[0]
}

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

async function main() {
  console.log('\nSeeding Aggressive Vault')
  console.log('========================')

  const aggressiveVault = getRiskVaultPDA(2)

  // Fetch vault data
  const vaultData = await program.account.riskVault.fetch(aggressiveVault)
  const shareMint = vaultData.shareMint as PublicKey
  console.log(`  Vault: ${aggressiveVault}`)
  console.log(`  Share mint: ${shareMint}`)
  console.log(`  Current TVL: ${Number(vaultData.totalAssets) / 1e6} USDC`)

  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey)
  const acct = await getAccount(connection, userUsdc)
  console.log(`  USDC balance: ${Number(acct.amount) / 1e6} USDC`)

  // Derive accounts
  const userPosition = getUserPositionPDA(wallet.publicKey, aggressiveVault)
  const userShares = await getAssociatedTokenAddress(shareMint, wallet.publicKey)
  const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)

  // Ensure user shares ATA exists
  try {
    await getAccount(connection, userShares)
  } catch {
    console.log('  Creating user shares ATA...')
    const createAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey, userShares, wallet.publicKey, shareMint,
    )
    const tx = new Transaction().add(createAtaIx)
    await provider.sendAndConfirm(tx)
    console.log('  [ok] Created')
  }

  // Deposit
  const tx = await program.methods
    .deposit(new BN(DEPOSIT_AMOUNT))
    .accounts({
      allocator: allocatorPDA,
      riskVault: aggressiveVault,
      userPosition,
      shareMint,
      userUsdc,
      userShares,
      vaultUsdc,
      user: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`\n  [PASS] Deposited ${DEPOSIT_AMOUNT / 1e6} USDC into Aggressive Vault`)
  console.log(`         tx: ${tx}`)

  // Verify
  const updated = await program.account.riskVault.fetch(aggressiveVault)
  console.log(`         New TVL: ${Number(updated.totalAssets) / 1e6} USDC`)
}

main().catch((err) => {
  console.error('\nDeposit failed:', err.message || err)
  if (err.logs) err.logs.forEach((l: string) => console.error(`  ${l}`))
  process.exit(1)
})
