/**
 * NanuqFi Halt/Resume Test Script
 *
 * Tests F9-F10: Emergency halt → frontend reflects, Resume → frontend normal
 *
 * Usage:
 *   npx tsx scripts/test-halt-resume.ts halt     # Halt the allocator
 *   npx tsx scripts/test-halt-resume.ts resume   # Resume the allocator
 *   npx tsx scripts/test-halt-resume.ts status   # Check current state
 */

import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import idl from '../target/idl/nanuqfi_allocator.json' assert { type: 'json' }

const PROGRAM_ID = new PublicKey('CDhkMBnc43wJQyVaSrreXk2ojvQvZMWrAWNBLSjaRJxq')

const adminKeypairPath = resolve(process.env.HOME!, 'Documents/secret/solana-devnet.json')
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(adminKeypairPath, 'utf-8'))),
)

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const wallet = new Wallet(adminKeypair)
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const program = new Program(idl as any, provider)

const [allocatorPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('allocator')],
  PROGRAM_ID,
)

async function getStatus(): Promise<boolean> {
  const data = await program.account.allocator.fetch(allocatorPDA)
  return data.halted as boolean
}

async function halt(): Promise<void> {
  const halted = await getStatus()
  if (halted) {
    console.log('Already halted.')
    return
  }

  const tx = await program.methods
    .emergencyHalt()
    .accounts({
      allocator: allocatorPDA,
      admin: wallet.publicKey,
    })
    .rpc()
  console.log(`Halted — tx: ${tx}`)
  console.log('Check https://app.nanuqfi.com for red "Protocol Halted" banner.')
}

async function resume(): Promise<void> {
  const halted = await getStatus()
  if (!halted) {
    console.log('Already running (not halted).')
    return
  }

  const tx = await program.methods
    .resume()
    .accounts({
      allocator: allocatorPDA,
      admin: wallet.publicKey,
    })
    .rpc()
  console.log(`Resumed — tx: ${tx}`)
  console.log('Check https://app.nanuqfi.com — banner should disappear.')
}

async function main() {
  const action = process.argv[2]

  console.log(`Allocator PDA: ${allocatorPDA.toBase58()}`)
  console.log(`Admin: ${wallet.publicKey.toBase58()}`)

  const halted = await getStatus()
  console.log(`Current state: ${halted ? 'HALTED' : 'RUNNING'}`)

  if (action === 'halt') {
    await halt()
  } else if (action === 'resume') {
    await resume()
  } else if (action === 'status') {
    // Already printed
  } else {
    console.log('\nUsage: npx tsx scripts/test-halt-resume.ts [halt|resume|status]')
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
