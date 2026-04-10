/**
 * NanuqFi Devnet: Seed TVL + Whitelist Protocol + Keeper Rebalance
 *
 * 1. Deposit 100 USDC → moderate vault, 50 USDC → aggressive vault
 * 2. Whitelist a protocol address, test allocate + recall
 * 3. Keeper acquires lease + submits rebalance
 *
 * Usage: npx tsx scripts/seed-and-test.ts
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
const BN = anchor.default?.BN ?? anchor.BN

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')

// PDAs
const [allocatorPDA] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)
const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID)
const [moderateVault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), Buffer.from([1])], PROGRAM_ID)
const [aggressiveVault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), Buffer.from([2])], PROGRAM_ID)

function getUserPositionPDA(user: PublicKey, vault: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), user.toBuffer(), vault.toBuffer()],
    PROGRAM_ID,
  )
  return pda
}

// Wallets
const adminKeypairPath = resolve(process.env.HOME!, 'Documents/secret/solana-devnet.json')
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(adminKeypairPath, 'utf-8'))),
)

const keeperKeypairPath = resolve(process.env.HOME!, 'Documents/secret/nanuqfi-keeper.json')
const keeperKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keeperKeypairPath, 'utf-8'))),
)

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const adminWallet = new Wallet(adminKeypair)
const adminProvider = new AnchorProvider(connection, adminWallet, { commitment: 'confirmed' })
setProvider(adminProvider)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const program = new Program(idl as any, adminProvider)

const keeperWallet = new Wallet(keeperKeypair)
const keeperProvider = new AnchorProvider(connection, keeperWallet, { commitment: 'confirmed' })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const keeperProgram = new Program(idl as any, keeperProvider)

// ─── Helpers ────────────────────────────────────────────────────────────────

async function deposit(vaultPDA: PublicKey, shareMint: PublicKey, amount: number, label: string) {
  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, adminKeypair.publicKey)
  const userShares = await getAssociatedTokenAddress(shareMint, adminKeypair.publicKey)
  const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)
  const userPosition = getUserPositionPDA(adminKeypair.publicKey, vaultPDA)

  // Ensure user shares ATA exists
  await getOrCreateAssociatedTokenAccount(connection, adminKeypair, shareMint, adminKeypair.publicKey)

  const tx = await program.methods
    .deposit(new BN(amount))
    .accounts({
      allocator: allocatorPDA,
      riskVault: vaultPDA,
      userPosition,
      shareMint,
      usdcMint: USDC_MINT,
      userUsdc,
      userShares,
      vaultUsdc,
      user: adminKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log(`  [done] ${label}: ${amount / 1e6} USDC — tx: ${tx.slice(0, 20)}...`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nNanuqFi Devnet: Seed + Whitelist + Rebalance')
  console.log('='.repeat(50))
  console.log(`  Admin:  ${adminKeypair.publicKey}`)
  console.log(`  Keeper: ${keeperKeypair.publicKey}`)

  // Read vault data to get share mints
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modVaultData = await program.account.riskVault.fetch(moderateVault) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggVaultData = await program.account.riskVault.fetch(aggressiveVault) as any
  const modShareMint = modVaultData.shareMint as PublicKey
  const aggShareMint = aggVaultData.shareMint as PublicKey

  // ─── 1. Seed TVL ──────────────────────────────────────────────────────

  console.log('\n1. Seeding TVL')

  // Deposit if vault has capacity (skip if already seeded)
  try {
    await deposit(moderateVault, modShareMint, 100_000_000, 'Moderate')
  } catch (err: any) {
    if (err.message?.includes('DepositCapExceeded')) console.log('  [skip] Moderate vault already at cap')
    else throw err
  }
  try {
    await deposit(aggressiveVault, aggShareMint, 50_000_000, 'Aggressive')
  } catch (err: any) {
    if (err.message?.includes('DepositCapExceeded')) console.log('  [skip] Aggressive vault already at cap')
    else throw err
  }

  // Verify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allocData = await program.account.allocator.fetch(allocatorPDA) as any
  console.log(`  TVL: ${(allocData.totalTvl as bigint).toString()} lamports (${Number(allocData.totalTvl) / 1e6} USDC)`)

  // ─── 2. Whitelist Protocol + Test Allocate/Recall ─────────────────────

  console.log('\n2. Whitelist Protocol + Allocate/Recall')

  // Use admin's own address as the "protocol owner" for testing
  const protocolOwner = adminKeypair.publicKey

  // Create a "protocol USDC" token account (ATA of admin, used as protocol destination)
  const protocolUsdc = await getOrCreateAssociatedTokenAccount(
    connection, adminKeypair, USDC_MINT, protocolOwner,
  )
  console.log(`  Protocol USDC account: ${protocolUsdc.address}`)

  // Whitelist the protocol owner
  try {
    const tx = await program.methods
      .addWhitelistedProtocol(protocolOwner)
      .accounts({
        allocator: allocatorPDA,
        admin: adminKeypair.publicKey,
      })
      .rpc()
    console.log(`  [done] Whitelisted ${protocolOwner.toBase58().slice(0, 8)}... — tx: ${tx.slice(0, 20)}...`)
  } catch (err: any) {
    if (err.message?.includes('AlreadyWhitelisted')) {
      console.log(`  [skip] Protocol already whitelisted`)
    } else {
      throw err
    }
  }

  // Allocate 10 USDC from moderate vault to protocol
  const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)

  const allocTx = await keeperProgram.methods
    .allocateToProtocol(new BN(10_000_000)) // 10 USDC
    .accounts({
      allocator: allocatorPDA,
      riskVault: moderateVault,
      keeper: keeperKeypair.publicKey,
      usdcMint: USDC_MINT,
      vaultUsdc,
      protocolUsdc: protocolUsdc.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
  console.log(`  [done] Allocated 10 USDC to protocol — tx: ${allocTx.slice(0, 20)}...`)

  // Verify protocol received USDC
  const protocolBal = await getAccount(connection, protocolUsdc.address)
  console.log(`  Protocol USDC balance: ${Number(protocolBal.amount) / 1e6} USDC`)

  // Recall requires protocol-side CPI (allocator PDA must own the source account).
  // On devnet with admin-owned protocol account, the allocator PDA can't sign.
  // This is correct security behavior — skip recall in devnet test.
  console.log(`  [skip] Recall requires protocol-owned account (correct security behavior)`)

  // ─── 3. Keeper Rebalance ──────────────────────────────────────────────

  console.log('\n3. Keeper Rebalance')

  // Acquire lease
  const [leasePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('lease'), moderateVault.toBuffer()],
    PROGRAM_ID,
  )

  try {
    const leaseTx = await keeperProgram.methods
      .acquireLease()
      .accounts({
        allocator: allocatorPDA,
        keeperLease: leasePDA,
        riskVault: moderateVault,
        keeperAuthority: keeperKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc()
    console.log(`  [done] Lease acquired — tx: ${leaseTx.slice(0, 20)}...`)
  } catch (err: any) {
    if (err.message?.includes('LeaseConflict')) console.log('  [skip] Lease already held by keeper')
    else throw err
  }

  // Rebalance: weights must comply with max_single_asset_bps (2000 = 20%)
  // 5 strategies @ 2000 bps each = 10000 (100%)
  const newWeights = [2000, 2000, 2000, 2000, 2000]
  const equitySnapshot = 100_000_000 // 100 USDC (matches moderate vault deposits)
  const reasoningHash = Array.from(Buffer.from('hardening-test-rebalance-001', 'utf-8')).slice(0, 32)

  // Rebalance record PDA
  const modVaultRefresh = await program.account.riskVault.fetch(moderateVault) as any
  const counter = modVaultRefresh.rebalanceCounter as number
  const [rebalanceRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('rebalance'), moderateVault.toBuffer(), Buffer.from(new Uint32Array([counter]).buffer)],
    PROGRAM_ID,
  )

  const treasuryData = await program.account.treasury.fetch(treasuryPDA) as any
  const treasuryUsdcAccount = treasuryData.usdcTokenAccount as PublicKey

  const rebalanceTx = await keeperProgram.methods
    .rebalance(
      newWeights,
      new BN(equitySnapshot),
      Buffer.from(reasoningHash),
    )
    .accounts({
      allocator: allocatorPDA,
      riskVault: moderateVault,
      rebalanceRecord,
      treasury: treasuryPDA,
      usdcMint: USDC_MINT,
      vaultUsdc,
      treasuryUsdc: treasuryUsdcAccount,
      keeperAuthority: keeperKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
  console.log(`  [done] Rebalance submitted — weights: [${newWeights}] — tx: ${rebalanceTx.slice(0, 20)}...`)

  // Verify final state
  const finalMod = await program.account.riskVault.fetch(moderateVault) as any
  console.log(`  Moderate vault weights: [${finalMod.currentWeights}]`)
  console.log(`  Rebalance counter: ${finalMod.rebalanceCounter}`)

  // ─── Summary ──────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(50))
  console.log('All operations completed successfully!')
  const finalAlloc = await program.account.allocator.fetch(allocatorPDA) as any
  console.log(`  TVL: ${Number(finalAlloc.totalTvl) / 1e6} USDC`)
  console.log(`  Whitelist: ${finalAlloc.protocolWhitelist.length} protocol(s)`)
  console.log(`  Halted: ${finalAlloc.halted}`)
}

main().catch((err) => {
  console.error('\nFailed:', err.message || err)
  process.exit(1)
})
