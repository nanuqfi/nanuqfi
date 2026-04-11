import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const PROGRAM_ID = new PublicKey('2QtJ5kmxLuW2jYCFpJMtzZ7PCnKdoMwkeueYoDUi5z5P')
const USDC_MINT = new PublicKey('BiTXT15XyfSakk5Yz8L8QrzHPWbK8NjoZeEMFrDvKdKh')
const userWallet = new PublicKey('HciZTd6rR7YsaS5ZNThx9KdgqSimxwMzJgs2j98U25En')

async function main() {
  const [allocator] = PublicKey.findProgramAddressSync([Buffer.from('allocator')], PROGRAM_ID)
  const [moderateVault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), Buffer.from([1])], PROGRAM_ID)
  const [userPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), userWallet.toBytes(), moderateVault.toBytes()], PROGRAM_ID
  )

  const vaultInfo = await connection.getAccountInfo(moderateVault)
  if (!vaultInfo) { console.log('Vault not found!'); return }
  console.log('Vault data length:', vaultInfo.data.length, 'bytes')

  // v1: disc(8) + version(1) + allocator(32) + risk_level(1) + protocol_vault(32) + share_mint(32)
  const shareMint = new PublicKey(vaultInfo.data.subarray(74, 106))
  console.log('Share mint:', shareMint.toBase58())

  const userUsdc = await getAssociatedTokenAddress(USDC_MINT, userWallet)
  const userShares = await getAssociatedTokenAddress(shareMint, userWallet)
  const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, allocator, true)

  console.log('\nUser wallet:', userWallet.toBase58())
  console.log('User USDC ATA:', userUsdc.toBase58())
  console.log('User Shares ATA:', userShares.toBase58())
  console.log('Vault USDC ATA:', vaultUsdc.toBase58())
  console.log('User Position PDA:', userPosition.toBase58())

  const solBal = await connection.getBalance(userWallet)
  console.log('\nUser SOL balance:', solBal / 1e9)

  try {
    const usdcAcc = await getAccount(connection, userUsdc)
    console.log('User USDC balance:', Number(usdcAcc.amount) / 1e6)
  } catch { console.log('User USDC ATA: DOES NOT EXIST') }

  try {
    const shareAcc = await getAccount(connection, userShares)
    console.log('User shares balance:', Number(shareAcc.amount))
  } catch { console.log('User shares ATA: DOES NOT EXIST ← THIS IS THE PROBLEM') }

  try {
    const vaultAcc = await getAccount(connection, vaultUsdc)
    console.log('Vault USDC balance:', Number(vaultAcc.amount) / 1e6)
  } catch { console.log('Vault USDC ATA: DOES NOT EXIST') }

  const posInfo = await connection.getAccountInfo(userPosition)
  console.log('User position:', posInfo ? `exists (${posInfo.data.length} bytes)` : 'does not exist (will be created)')
}

main().catch(console.error)
