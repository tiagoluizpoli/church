import { NotFoundError } from '@church/core';
import {
  type ChurchRecord,
  createChurch,
  createDb,
  invitation,
  type TenancyWriter,
  user,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ChurchSlugTakenError } from '../domain/errors/church-slug-taken';

// Better Auth's own default for its `invitation` table — the plugin's HTTP
// API is bypassed here, so this operation reproduces it rather than leaving
// the column to drift from what redemption expects.
const CHURCH_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

const ORGANIZATION_SLUG_UNIQUE_CONSTRAINT = 'organization_slug_unique';

const AdminEmailSchema = z.email();

interface AssertOperatorExistsInput {
  tx: TenancyWriter;
  operatorUserId: string;
}

/** Turns a mistyped `--operator-user-id` into a clear message instead of a raw FK-violation stack trace. */
async function assertOperatorExists({
  tx,
  operatorUserId,
}: AssertOperatorExistsInput): Promise<void> {
  const [operator] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, operatorUserId));

  if (!operator) {
    throw new NotFoundError(
      `Platform Operator User not found: ${operatorUserId}`,
    );
  }
}

interface PostgresUniqueViolation {
  code: '23505';
  constraint?: string;
  cause?: unknown;
}

interface IsSlugUniqueViolationInput {
  error: unknown;
}

/**
 * `createChurch`'s insert throws through drizzle-orm's node-postgres driver,
 * which wraps the raw `pg` error in a `DrizzleQueryError` rather than
 * surfacing it directly — the unique-violation `code`/`constraint` live one
 * level down, on `.cause`.
 */
function isSlugUniqueViolation({ error }: IsSlugUniqueViolationInput): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<PostgresUniqueViolation>;
  if (
    candidate.code === '23505' &&
    candidate.constraint === ORGANIZATION_SLUG_UNIQUE_CONSTRAINT
  ) {
    return true;
  }
  return isSlugUniqueViolation({ error: candidate.cause });
}

interface RedemptionPathForInput {
  invitationId: string;
}

function redemptionPathFor({ invitationId }: RedemptionPathForInput): string {
  return `/invitations/church/${invitationId}`;
}

interface PrintRedemptionPathInput {
  invitationId: string;
  baseUrl?: string;
}

/**
 * Printed regardless of `baseUrl`: this operation may run where no delivery
 * worker is polling, so the operator needs a way to convey the invitation
 * out-of-band. `baseUrl` is convenience only — it is never persisted.
 */
function printRedemptionPath({
  invitationId,
  baseUrl,
}: PrintRedemptionPathInput): string {
  const path = redemptionPathFor({ invitationId });
  console.log(`Redemption path: ${baseUrl ? `${baseUrl}${path}` : path}`);
  return path;
}

export interface ProvisionChurchInput {
  db: TenancyWriter;
  churchName: string;
  churchSlug: string;
  adminEmail: string;
  /** The Platform Operator's own User id — resolving which User that is happens outside this operation. */
  operatorUserId: string;
  baseUrl?: string;
  /** Supply only when a fixture pins the identifier; production provisioning never does. */
  id?: string;
}

export interface ProvisionChurchResult {
  church: ChurchRecord;
  invitationId: string;
  redemptionPath: string;
}

/**
 * The Platform Operator's provisioning operation: creates the organization,
 * the Church extension row, and the first Church Invitation in one
 * transaction. Never goes through Better Auth's plugin HTTP API — that route
 * requires the caller to already be a session-bearing member of the org,
 * which the Platform Operator, by design, never is. This writes the
 * `invitation` row directly, the same way `createChurch` already writes
 * `organization` and `church`.
 */
export async function provisionChurch(
  input: ProvisionChurchInput,
): Promise<ProvisionChurchResult> {
  const adminEmail = AdminEmailSchema.parse(input.adminEmail);

  const { church, invitationId } = await input.db.transaction(async (tx) => {
    await assertOperatorExists({ tx, operatorUserId: input.operatorUserId });

    let createdChurch: ChurchRecord;
    try {
      createdChurch = await createChurch({
        db: tx,
        id: input.id,
        name: input.churchName,
        slug: input.churchSlug,
      });
    } catch (error) {
      if (isSlugUniqueViolation({ error })) {
        throw new ChurchSlugTakenError(input.churchSlug);
      }
      throw error;
    }

    const newInvitationId = crypto.randomUUID();
    await tx.insert(invitation).values({
      id: newInvitationId,
      organizationId: createdChurch.id,
      email: adminEmail,
      role: 'admin',
      status: 'pending',
      expiresAt: new Date(Date.now() + CHURCH_INVITATION_TTL_MS),
      inviterId: input.operatorUserId,
    });

    return { church: createdChurch, invitationId: newInvitationId };
  });

  const redemptionPath = printRedemptionPath({
    invitationId,
    baseUrl: input.baseUrl,
  });

  return { church, invitationId, redemptionPath };
}

export interface RepairChurchInvitationInput {
  db: TenancyWriter;
  invitationId: string;
  newEmail: string;
  baseUrl?: string;
}

export interface RepairChurchInvitationResult {
  invitationId: string;
  redemptionPath: string;
}

/**
 * Repairs a wrong administrator email by canceling the pending Church
 * Invitation and minting a new one in its place. No teardown of the
 * organization or Church extension row — nobody has redeemed yet.
 */
export async function repairChurchInvitation(
  input: RepairChurchInvitationInput,
): Promise<RepairChurchInvitationResult> {
  const newEmail = AdminEmailSchema.parse(input.newEmail);

  const newInvitationId = await input.db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.id, input.invitationId),
          eq(invitation.status, 'pending'),
        ),
      );

    if (!existing) {
      throw new NotFoundError(
        `Pending Church Invitation not found: ${input.invitationId}`,
      );
    }

    await tx
      .update(invitation)
      .set({ status: 'canceled' })
      .where(eq(invitation.id, existing.id));

    const replacementId = crypto.randomUUID();
    await tx.insert(invitation).values({
      id: replacementId,
      organizationId: existing.organizationId,
      email: newEmail,
      role: existing.role,
      status: 'pending',
      expiresAt: new Date(Date.now() + CHURCH_INVITATION_TTL_MS),
      inviterId: existing.inviterId,
    });

    return replacementId;
  });

  const redemptionPath = printRedemptionPath({
    invitationId: newInvitationId,
    baseUrl: input.baseUrl,
  });

  return { invitationId: newInvitationId, redemptionPath };
}

interface ParsedCliArgs {
  churchName: string;
  churchSlug: string;
  adminEmail: string;
  operatorUserId: string;
  baseUrl?: string;
}

interface ParseCliArgsInput {
  argv: string[];
}

function parseCliArgs({ argv }: ParseCliArgsInput): ParsedCliArgs {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg?.startsWith('--')) {
      const value = argv[index + 1];
      if (value !== undefined) flags.set(arg.slice(2), value);
    }
  }

  const churchName = flags.get('name');
  const churchSlug = flags.get('slug');
  const adminEmail = flags.get('admin-email');
  const operatorUserId = flags.get('operator-user-id');

  if (!churchName || !churchSlug || !adminEmail || !operatorUserId) {
    throw new Error(
      'Usage: provision-church --name <name> --slug <slug> --admin-email <email> --operator-user-id <id> [--base-url <url>]',
    );
  }

  return {
    churchName,
    churchSlug,
    adminEmail,
    operatorUserId,
    baseUrl: flags.get('base-url'),
  };
}

if (import.meta.main) {
  const db = createDb();
  const args = parseCliArgs({ argv: process.argv.slice(2) });

  provisionChurch({ db, ...args })
    .then((result) => {
      console.log('✅ Church provisioned.');
      console.log(`Church: ${result.church.name} (${result.church.slug})`);
      console.log(`Invitation: ${result.invitationId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Church provisioning failed:', error);
      process.exit(1);
    });
}
