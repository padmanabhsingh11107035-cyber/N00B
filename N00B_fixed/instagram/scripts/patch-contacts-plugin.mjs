// The contacts tool (@capacitor-community/contacts) asks Android for TWO permissions under one name: read AND write contacts. If the app does not declare both, Android refuses the
// whole request ("Missing the following permissions in AndroidManifest.xml: WRITE_CONTACTS"). NOOB only READS contacts (to find friends), so this makes the tool ask for the read
// permission only: the app then declares READ_CONTACTS and nothing more. It runs after every install of the packages (package.json "postinstall") and can be run by hand.
import fs from 'node:fs';
import path from 'node:path';

const file = path.join('node_modules', '@capacitor-community', 'contacts', 'android', 'src', 'main', 'java', 'getcapacitor', 'community', 'contacts', 'ContactsPlugin.java');
if (!fs.existsSync(file)) { console.log('contacts tool not installed: nothing to patch'); process.exit(0); }
const src = fs.readFileSync(file, 'utf8');
const both = 'strings = { Manifest.permission.READ_CONTACTS, Manifest.permission.WRITE_CONTACTS }';
const readOnly = 'strings = { Manifest.permission.READ_CONTACTS }';
if (src.includes(readOnly)) { console.log('contacts tool: already read-only'); process.exit(0); }
if (!src.includes(both)) { console.log('contacts tool: permission line not found (a new version?), left as it is'); process.exit(0); }
fs.writeFileSync(file, src.replace(both, readOnly));
console.log('contacts tool: now asks for READ_CONTACTS only');
