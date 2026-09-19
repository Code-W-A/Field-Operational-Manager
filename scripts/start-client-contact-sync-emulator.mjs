import { mkdtemp, writeFile, copyFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(path.join(tmpdir(), 'fom-contact-emulator-'))
await symlink(path.join(root, 'firebase-functions/node_modules'), path.join(directory, 'node_modules'), 'dir')
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'contact-sync-test', main: 'index.js', engines: { node: '20' }, dependencies: { 'firebase-admin': '^12.7.0', 'firebase-functions': '^4.9.0' } }))
await writeFile(path.join(directory, 'index.js'), `require('firebase-admin/app').initializeApp();\nmodule.exports = require(${JSON.stringify(path.join(root, 'firebase-functions/lib/client-ticket-sync-worker.js'))});\n`)
await copyFile(path.join(root, 'firestore.rules'), path.join(directory, 'firestore.rules'))
await writeFile(path.join(directory, 'firebase.json'), JSON.stringify({ functions: { source: '.' }, firestore: { rules: 'firestore.rules' },
  emulators: { firestore: { port: 8180 }, functions: { port: 5501 }, hub: { port: 4500 }, logging: { port: 4600 }, ui: { enabled: false } } }))
console.log(`Configurație izolată: ${directory}; proiect: demo-fom-contact-sync`)
const child = spawn('firebase', ['emulators:start', '--only', 'firestore,functions', '--project', 'demo-fom-contact-sync', '--config', path.join(directory, 'firebase.json')], {
  cwd: directory, stdio: 'inherit', env: { ...process.env, FIREBASE_EMULATORS_PATH: process.env.FIREBASE_EMULATORS_PATH || path.join(tmpdir(), 'fom-contact-emulator-cache') },
})
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code || 0 })
