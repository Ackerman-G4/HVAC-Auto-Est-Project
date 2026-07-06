import 'dotenv/config';
import process from 'node:process';
import type { Auth } from 'firebase-admin/auth';

type SupportedRole = 'admin' | 'engineer';

interface ParsedArgs {
  email?: string;
  uid?: string;
  role: SupportedRole;
  dryRun: boolean;
  help: boolean;
}

function printUsage() {
  console.log('Usage: npm run auth:set-role -- --email <email> --role <admin|engineer> [--dry-run]');
  console.log('   or: npm run auth:set-role -- --uid <uid> --role <admin|engineer> [--dry-run]');
  console.log('');
  console.log('Examples:');
  console.log('  npm run auth:set-role -- --email admin@example.com --role admin');
  console.log('  npm run auth:set-role -- --uid abc123 --role engineer --dry-run');
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    role: 'engineer',
    dryRun: false,
    help: false,
  };

  let roleProvided = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--email':
        parsed.email = readValue(argv, i, '--email').trim();
        i += 1;
        break;
      case '--uid':
        parsed.uid = readValue(argv, i, '--uid').trim();
        i += 1;
        break;
      case '--role': {
        const role = readValue(argv, i, '--role').trim();
        if (role !== 'admin' && role !== 'engineer') {
          throw new Error('Role must be either "admin" or "engineer"');
        }
        parsed.role = role;
        roleProvided = true;
        i += 1;
        break;
      }
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.help) {
    if (!roleProvided) {
      throw new Error('Missing required argument: --role');
    }

    if (!parsed.email && !parsed.uid) {
      throw new Error('Provide either --email or --uid');
    }
  }

  return parsed;
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printUsage();
    return;
  }

  const firebaseServerModule = (await import('../src/lib/firebase/server')) as {
    getFirebaseAuth?: () => Auth;
    default?: { getFirebaseAuth?: () => Auth };
  };

  const getFirebaseAuth =
    firebaseServerModule.getFirebaseAuth || firebaseServerModule.default?.getFirebaseAuth;

  if (typeof getFirebaseAuth !== 'function') {
    throw new Error('Unable to resolve getFirebaseAuth from src/lib/firebase/server');
  }

  const auth = getFirebaseAuth();
  const user = parsed.uid
    ? await auth.getUser(parsed.uid)
    : await auth.getUserByEmail(parsed.email as string);

  const currentClaims = user.customClaims || {};
  const previousRole = typeof currentClaims.role === 'string' ? currentClaims.role : 'engineer';

  const nextClaims = {
    ...currentClaims,
    role: parsed.role,
  };

  console.log('Role provisioning request');
  console.log(`- uid: ${user.uid}`);
  console.log(`- email: ${user.email || ''}`);
  console.log(`- previous role: ${previousRole}`);
  console.log(`- next role: ${parsed.role}`);

  if (parsed.dryRun) {
    console.log('Dry run enabled; no changes applied.');
    return;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);
  const updated = await auth.getUser(user.uid);
  const appliedRole = updated.customClaims?.role;

  if (appliedRole !== parsed.role) {
    throw new Error('Role update did not persist as expected');
  }

  console.log('Role updated successfully.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
});
