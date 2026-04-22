import 'dotenv/config';
import process from 'node:process';

type GetFirebaseDb = () => {
  collection: (name: string) => {
    get: () => Promise<{ docs: Array<{ data: () => Record<string, unknown> }> }>;
  };
};

type BackfillForOwner = (
  ownerId: string,
  projectId?: string,
) => Promise<{ checkedCount: number; updatedCount: number; skippedCount: number }>;

interface ParsedArgs {
  ownerId?: string;
  projectId?: string;
  help: boolean;
}

function printUsage(): void {
  console.log('Usage: npm run reports:backfill:legacy -- [--owner <ownerId>] [--project <projectId>]');
  console.log('');
  console.log('Examples:');
  console.log('  npm run reports:backfill:legacy');
  console.log('  npm run reports:backfill:legacy -- --owner user_123');
  console.log('  npm run reports:backfill:legacy -- --owner user_123 --project abc-project');
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--owner':
        parsed.ownerId = readValue(argv, i, '--owner').trim();
        i += 1;
        break;
      case '--project':
        parsed.projectId = readValue(argv, i, '--project').trim();
        i += 1;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function listOwnerIdsFromHistory(getFirebaseDb: GetFirebaseDb): Promise<string[]> {
  const snapshot = await getFirebaseDb().collection('simulationReportHistory').get();

  const ownerIds = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const ownerId = typeof data.ownerId === 'string' ? data.ownerId.trim() : '';
    if (ownerId.length > 0) {
      ownerIds.add(ownerId);
    }
  });

  return [...ownerIds].sort();
}

async function resolveDependencies(): Promise<{
  getFirebaseDb: GetFirebaseDb;
  backfillLegacySimulationReportHistoryForOwner: BackfillForOwner;
}> {
  const firebaseServerModule = (await import('../src/lib/firebase/server')) as {
    getFirebaseDb?: GetFirebaseDb;
    default?: { getFirebaseDb?: GetFirebaseDb };
  };

  const historyStoreModule = (await import('../src/lib/firebase/simulation-report-history-store')) as {
    backfillLegacySimulationReportHistoryForOwner?: BackfillForOwner;
    default?: { backfillLegacySimulationReportHistoryForOwner?: BackfillForOwner };
  };

  const getFirebaseDb =
    firebaseServerModule.getFirebaseDb ||
    firebaseServerModule.default?.getFirebaseDb;

  const backfillLegacySimulationReportHistoryForOwner =
    historyStoreModule.backfillLegacySimulationReportHistoryForOwner ||
    historyStoreModule.default?.backfillLegacySimulationReportHistoryForOwner;

  if (typeof getFirebaseDb !== 'function') {
    throw new Error('Unable to resolve getFirebaseDb from src/lib/firebase/server');
  }

  if (typeof backfillLegacySimulationReportHistoryForOwner !== 'function') {
    throw new Error('Unable to resolve backfillLegacySimulationReportHistoryForOwner export');
  }

  return {
    getFirebaseDb,
    backfillLegacySimulationReportHistoryForOwner,
  };
}

async function run(): Promise<void> {
  const {
    getFirebaseDb,
    backfillLegacySimulationReportHistoryForOwner,
  } = await resolveDependencies();

  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printUsage();
    return;
  }

  const ownerIds = parsed.ownerId ? [parsed.ownerId] : await listOwnerIdsFromHistory(getFirebaseDb);

  if (ownerIds.length === 0) {
    console.log('No owners found in simulation report history. Nothing to backfill.');
    return;
  }

  let aggregateChecked = 0;
  let aggregateUpdated = 0;
  let aggregateSkipped = 0;

  for (const ownerId of ownerIds) {
    const result = await backfillLegacySimulationReportHistoryForOwner(ownerId, parsed.projectId);
    aggregateChecked += result.checkedCount;
    aggregateUpdated += result.updatedCount;
    aggregateSkipped += result.skippedCount;

    console.log(
      `owner=${ownerId} checked=${result.checkedCount} updated=${result.updatedCount} skipped=${result.skippedCount}`,
    );
  }

  console.log('');
  console.log('Backfill summary');
  console.log(`owners: ${ownerIds.length}`);
  console.log(`checked: ${aggregateChecked}`);
  console.log(`updated: ${aggregateUpdated}`);
  console.log(`skipped: ${aggregateSkipped}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
});
