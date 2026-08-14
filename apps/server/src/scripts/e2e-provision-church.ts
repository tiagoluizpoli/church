import { createDb } from '@church/db';
import { ensurePlatformOperator } from './ensure-platform-operator';
import { provisionChurch } from './provision-church';

interface E2eProvisionChurchInput {
  id: string;
  name: string;
  slug: string;
  adminEmail: string;
}

function parseInput(): E2eProvisionChurchInput {
  const [id, name, slug, adminEmail] = Bun.argv.slice(2);
  if (!id || !name || !slug || !adminEmail) {
    throw new Error('Expected id, name, slug, and adminEmail arguments.');
  }
  return { id, name, slug, adminEmail };
}

const input = parseInput();
const db = createDb();
const operator = await ensurePlatformOperator({ db });
const result = await provisionChurch({
  db,
  id: input.id,
  churchName: input.name,
  churchSlug: input.slug,
  adminEmail: input.adminEmail,
  operatorUserId: operator.id,
});
console.log(
  JSON.stringify({
    churchId: result.church.id,
    invitationId: result.invitationId,
  }),
);
