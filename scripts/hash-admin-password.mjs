import { emitKeypressEvents } from 'node:readline';
import { hashPassword } from '../lib/admin-security.mjs';

if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva. La contraseña no se pasa como argumento.');
process.stdout.write('Contraseña del administrador (mínimo 12 caracteres; entrada oculta): ');
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = '';
await new Promise(resolve => {
  process.stdin.on('keypress', function input(text, key) {
    if (key?.ctrl && key.name === 'c') process.exit(130);
    if (key?.name === 'return') { process.stdin.off('keypress', input); process.stdin.setRawMode(false); process.stdin.pause(); resolve(); }
    else if (key?.name === 'backspace') password = password.slice(0, -1);
    else if (text && !key?.ctrl && password.length < 256) password += text;
  });
});
console.log('\nADMIN_PASSWORD_HASH=' + await hashPassword(password));
