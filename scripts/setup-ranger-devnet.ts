/**
 * NanuqFi Ranger Adaptor Devnet Setup Script
 *
 * Sets up the Ranger adaptor integration on devnet:
 * 1. Create vault_idle_usdc (mock vault's USDC pool, owned by mock_vault_auth PDA)
 * 2. Create vault_strategy_asset_ata (strategy USDC, owned by vault_strategy_auth PDA)
 * 3. Create user_share_ata (moderate vault shares, owned by vault_strategy_auth PDA)
 * 4. Fund vault_strategy_auth PDA with SOL (for allocator's init_if_needed rent)
 * 5. Initialize NanuqFi strategy via mock vault → adaptor CPI
 * 6. Mint test USDC to vault_idle_usdc for E2E testing
 *
 * Prerequisites: allocator + moderate vault already initialized (run setup-devnet.ts first)
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/setup-ranger-devnet.ts
 */

import * as anchor from '@coral-xyz/anchor'
const { Program, AnchorProvider, Wallet, setProvider } = anchor
const BN = anchor.default?.BN ?? anchor.BN ?? (await import('bn.js')).default
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import adaptorIdl from '../target/idl/nanuqfi_adaptor.json' assert { type: 'json' }
import mockVaultIdl from '../target/idl/mock_ranger_vault.json' assert { type: 'json' }
import allocatorIdl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

// ─── Constants ─────────────────────────────────────────────────────────────

const ALLOCATOR_PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const ADAPTOR_PROGRAM_ID = new PublicKey('HsNnmuB18pA2U24K4Stc1yan67Cx96gmvGRqBUqRFWwY')
const MOCK_VAULT_PROGRAM_ID = new PublicKey('FCW6LsSvGAv3UdLixCkm4vygifxR1sVBonuserqFe9Fm')

// NanuqFi test USDC mint (we're mint authority)
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')

// Conservative vault = risk_level 0 (only v1 vault on devnet — moderate/aggressive still v0)
const RISK_LEVEL = 0

// ─── PDA Derivation ────────────────────────────────────────────────────────

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')],
  ALLOCATOR_PROGRAM_ID,
)

const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')],
  ALLOCATOR_PROGRAM_ID,
)

const [moderateVaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), Buffer.from([RISK_LEVEL])],
  ALLOCATOR_PROGRAM_ID,
)

// Strategy PDA: ["nanuqfi_strategy", allocator_pda]
const [strategyPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('nanuqfi_strategy'), allocatorPDA.toBuffer()],
  ADAPTOR_PROGRAM_ID,
)

// Mock vault auth PDA: ["mock_vault_auth"]
const [mockVaultAuthPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('mock_vault_auth')],
  MOCK_VAULT_PROGRAM_ID,
)

// Vault strategy auth PDA: ["vault_strategy_auth", strategy_key]
const [vaultStrategyAuthPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault_strategy_auth'), strategyPDA.toBuffer()],
  MOCK_VAULT_PROGRAM_ID,
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
const allocatorProgram = new Program(allocatorIdl as any, provider)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockVaultProgram = new Program(mockVaultIdl as any, provider)

// ─── Helpers ───────────────────────────────────────────────────────────────

async function accountExists(pubkey: PublicKey): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey)
  return info !== null
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('')
  console.log('NanuqFi Ranger Adaptor Setup')
  console.log('============================')
  console.log(`  Allocator:     ${ALLOCATOR_PROGRAM_ID}`)
  console.log(`  Adaptor:       ${ADAPTOR_PROGRAM_ID}`)
  console.log(`  Mock Vault:    ${MOCK_VAULT_PROGRAM_ID}`)
  console.log(`  Admin:         ${wallet.publicKey}`)
  console.log(`  Network:       devnet`)

  const balance = await connection.getBalance(wallet.publicKey)
  console.log(`  Balance:       ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)

  // Verify allocator + moderate vault exist
  if (!(await accountExists(allocatorPDA))) {
    console.error('\n  ERROR: Allocator not initialized. Run setup-devnet.ts first.')
    process.exit(1)
  }
  if (!(await accountExists(moderateVaultPDA))) {
    console.error('\n  ERROR: Moderate vault not initialized. Run setup-devnet.ts first.')
    process.exit(1)
  }

  // Parse share_mint from raw vault data (handles v0/v1 layout difference)
  // v0 (no version byte): share_mint at offset 8+32+1+32 = 73
  // v1 (has version byte): share_mint at offset 8+1+32+1+32 = 74
  const vaultInfo = await connection.getAccountInfo(moderateVaultPDA)
  if (!vaultInfo) throw new Error('Moderate vault account not found')
  const vaultDataSize = vaultInfo.data.length
  // v0 accounts are 212 bytes, v1 are 221 bytes
  const isV1 = vaultDataSize >= 221
  const shareMintOffset = isV1 ? 74 : 73
  const shareMint = new PublicKey(vaultInfo.data.subarray(shareMintOffset, shareMintOffset + 32))
  console.log(`  Share Mint:    ${shareMint} (vault ${isV1 ? 'v1' : 'v0'})`)

  // Parse treasury_usdc from raw treasury data
  // Treasury: 8(disc) + 1(version) + 32(admin) + 32(usdc_token_account) + 1(bump)
  // v0: 8(disc) + 32(admin) + 32(usdc_token_account) + 1(bump) — no version
  const treasuryInfo = await connection.getAccountInfo(treasuryPDA)
  if (!treasuryInfo) throw new Error('Treasury account not found')
  const treasuryDataSize = treasuryInfo.data.length
  // v0: 73 bytes, v1: 74 bytes
  const treasuryIsV1 = treasuryDataSize >= 74
  const treasuryUsdcOffset = treasuryIsV1 ? 41 : 40
  const treasuryUsdc = new PublicKey(
    treasuryInfo.data.subarray(treasuryUsdcOffset, treasuryUsdcOffset + 32),
  )
  console.log(`  Treasury USDC: ${treasuryUsdc}`)

  // Vault USDC = allocator PDA's ATA for USDC
  const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocatorPDA, true)
  console.log(`  Vault USDC:    ${vaultUsdc}`)

  console.log(`\n  Strategy PDA:          ${strategyPDA}`)
  console.log(`  Mock Vault Auth:       ${mockVaultAuthPDA}`)
  console.log(`  Vault Strategy Auth:   ${vaultStrategyAuthPDA}`)

  // ─── Step 1: Create vault_idle_usdc (owned by mock_vault_auth PDA) ─────

  console.log('\n1. Mock vault idle USDC pool')
  const vaultIdleUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    USDC_MINT,
    mockVaultAuthPDA,
    true, // allowOwnerOffCurve — PDA owner
  )
  console.log(`  [done] vault_idle_usdc: ${vaultIdleUsdc.address}`)

  // ─── Step 2: Create vault_strategy_asset_ata (owned by vault_strategy_auth PDA) ─

  console.log('\n2. Strategy asset USDC account')
  const vaultStrategyAssetAta = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    USDC_MINT,
    vaultStrategyAuthPDA,
    true,
  )
  console.log(`  [done] vault_strategy_asset_ata: ${vaultStrategyAssetAta.address}`)

  // ─── Step 3: Create user_share_ata (owned by vault_strategy_auth PDA) ──

  console.log('\n3. Share token account for strategy auth')
  const userShareAta = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    shareMint,
    vaultStrategyAuthPDA,
    true,
  )
  console.log(`  [done] user_share_ata: ${userShareAta.address}`)

  // ─── Step 4: Fund vault_strategy_auth PDA with SOL ─────────────────────

  console.log('\n4. Fund vault_strategy_auth with SOL')
  const authBalance = await connection.getBalance(vaultStrategyAuthPDA)
  if (authBalance < 0.01 * LAMPORTS_PER_SOL) {
    const transferIx = SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: vaultStrategyAuthPDA,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    })
    const txSig = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(transferIx),
    )
    console.log(`  [done] Funded 0.01 SOL — tx: ${txSig}`)
  } else {
    console.log(`  [skip] Already funded: ${(authBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
  }

  // ─── Step 5: Initialize NanuqFi strategy via mock vault ────────────────

  console.log('\n5. Initialize NanuqFi strategy')
  if (await accountExists(strategyPDA)) {
    console.log('  [skip] Strategy already initialized')
  } else {
    // Derive user_position PDA for vault_strategy_auth
    const [userPositionPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        vaultStrategyAuthPDA.toBuffer(),
        moderateVaultPDA.toBuffer(),
      ],
      ALLOCATOR_PROGRAM_ID,
    )

    const tx = await mockVaultProgram.methods
      .initializeStrategy()
      .accounts({
        manager: wallet.publicKey,
        strategy: strategyPDA,
        vaultStrategyAuth: vaultStrategyAuthPDA,
        allocator: allocatorPDA,
        riskVault: moderateVaultPDA,
        adaptorProgram: ADAPTOR_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    console.log(`  [done] Strategy initialized — tx: ${tx}`)
  }

  // ─── Step 6: Mint test USDC to vault idle pool ─────────────────────────

  console.log('\n6. Mint test USDC to mock vault idle pool')
  const MINT_AMOUNT = 1_000_000 // 1 USDC (6 decimals)
  if (vaultIdleUsdc.amount < BigInt(MINT_AMOUNT)) {
    const txSig = await mintTo(
      connection,
      adminKeypair,
      USDC_MINT,
      vaultIdleUsdc.address,
      adminKeypair, // mint authority
      MINT_AMOUNT,
    )
    console.log(`  [done] Minted ${MINT_AMOUNT / 1e6} USDC — tx: ${txSig}`)
  } else {
    console.log(`  [skip] Already has ${Number(vaultIdleUsdc.amount) / 1e6} USDC`)
  }

  // ─── Summary ───────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(52))
  console.log('Ranger Adaptor Setup Complete')
  console.log('='.repeat(52))
  console.log(`  Strategy:              ${strategyPDA}`)
  console.log(`  Vault Strategy Auth:   ${vaultStrategyAuthPDA}`)
  console.log(`  Vault Idle USDC:       ${vaultIdleUsdc.address}`)
  console.log(`  Strategy Asset ATA:    ${vaultStrategyAssetAta.address}`)
  console.log(`  User Share ATA:        ${userShareAta.address}`)
  console.log(`  Vault USDC:            ${vaultUsdc}`)
  console.log(`  Treasury USDC:         ${treasuryUsdc}`)
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
