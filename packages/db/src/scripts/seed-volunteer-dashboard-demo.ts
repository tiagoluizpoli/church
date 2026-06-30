import { and, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import * as schema from '../schema';

const DEMO_CHURCH_SLUG = 'volunteer-dashboard-demo';
const DEMO_CHURCH_NAME = 'Volunteer Dashboard Demo Church';
const DEMO_MINISTRY_NAME = 'Volunteer Dashboard Demo';
const DEMO_TEAM_NAME = 'Sunday Welcome Team';
const DEMO_PENDING_EVENT_TITLE = 'Demo Sunday Gathering';
const DEMO_CONFIRMED_EVENT_TITLE = 'Demo Prayer Night';
const DEMO_ROLE_HOST = 'Host';
const DEMO_ROLE_GREETER = 'Greeter';

interface CliOptions {
  email?: string;
}

interface AuthUserCandidate {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

interface DemoContext {
  user: typeof schema.user.$inferSelect;
  church: typeof schema.church.$inferSelect;
  volunteer: typeof schema.volunteer.$inferSelect;
  ministry: typeof schema.ministry.$inferSelect;
  team: typeof schema.team.$inferSelect;
  hostRole: typeof schema.role.$inferSelect;
  greeterRole: typeof schema.role.$inferSelect;
}

interface DemoEventSpec {
  title: string;
  startDate: Date;
  endDate: Date;
  slots: DemoSlotSpec[];
}

interface DemoSlotSpec {
  label: string;
  startTime: Date;
  endTime: Date;
}

interface DemoEventPlan {
  pendingEvent: DemoEventSpec;
  confirmedEvent: DemoEventSpec;
}

interface EnsureAssignmentInput {
  context: DemoContext;
  slotId: string;
  roleId: string;
  status: 'pending' | 'confirmed';
}

interface EnsureAvailabilityInput {
  context: DemoContext;
  eventId: string;
  startTime: Date;
  endTime: Date;
  type: 'available' | 'unavailable';
}

interface EnsureNotificationInput {
  context: DemoContext;
  title: string;
  body: string;
  type: (typeof schema.volunteerNotification.$inferInsert)['type'];
  eventId?: string;
  assignmentId?: string;
  readAt?: Date;
}

function parseCliOptions(argv: string[]): CliOptions {
  const emailArg = argv.find((arg) => arg.startsWith('--email='));
  return {
    email: emailArg?.slice('--email='.length),
  };
}

async function listAuthUserCandidates(): Promise<AuthUserCandidate[]> {
  const rows = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .innerJoin(schema.account, eq(schema.account.userId, schema.user.id))
    .orderBy(desc(schema.user.createdAt));

  const uniqueByEmail = new Map<string, AuthUserCandidate>();
  for (const row of rows) {
    if (!uniqueByEmail.has(row.email)) {
      uniqueByEmail.set(row.email, row);
    }
  }

  return Array.from(uniqueByEmail.values());
}

async function resolveTargetUser(email?: string) {
  if (email) {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
    });

    if (!user) {
      throw new Error(
        `No auth user found for "${email}". Sign up locally first, then rerun this script.`,
      );
    }

    return user;
  }

  const candidates = await listAuthUserCandidates();

  if (candidates.length === 0) {
    throw new Error(
      'No Better Auth users found. Sign up in the app first, then rerun this script.',
    );
  }

  if (candidates.length > 1) {
    const emails = candidates
      .map((candidate) => `- ${candidate.email}`)
      .join('\n');
    throw new Error(
      `Multiple auth users found. Rerun with --email=<address>.\n${emails}`,
    );
  }

  const [candidate] = candidates;
  if (!candidate) {
    throw new Error('Failed to resolve a target auth user.');
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, candidate.id),
  });

  if (!user) {
    throw new Error('Resolved auth user no longer exists.');
  }

  return user;
}

async function ensureChurch() {
  const existingChurch = await db.query.church.findFirst({
    where: eq(schema.church.slug, DEMO_CHURCH_SLUG),
  });
  if (existingChurch) {
    return existingChurch;
  }

  const firstChurch = await db.query.church.findFirst();
  if (firstChurch) {
    return firstChurch;
  }

  const [createdChurch] = await db
    .insert(schema.church)
    .values({
      name: DEMO_CHURCH_NAME,
      slug: DEMO_CHURCH_SLUG,
      timezone: 'America/Sao_Paulo',
    })
    .returning();

  if (!createdChurch) {
    throw new Error('Failed to create demo church.');
  }

  return createdChurch;
}

async function ensureVolunteerContext(
  user: typeof schema.user.$inferSelect,
): Promise<DemoContext> {
  const existingVolunteer = await db.query.volunteer.findFirst({
    where: eq(schema.volunteer.userId, user.id),
  });
  const church = existingVolunteer
    ? await db.query.church.findFirst({
        where: eq(schema.church.id, existingVolunteer.churchId),
      })
    : await ensureChurch();

  if (!church) {
    throw new Error('Unable to resolve church for demo seed.');
  }

  const volunteer =
    existingVolunteer ??
    (
      await db
        .insert(schema.volunteer)
        .values({
          userId: user.id,
          churchId: church.id,
          status: 'active',
        })
        .returning()
    )[0];

  if (!volunteer) {
    throw new Error('Unable to resolve volunteer for demo seed.');
  }

  const ministry =
    (await db.query.ministry.findFirst({
      where: and(
        eq(schema.ministry.churchId, church.id),
        eq(schema.ministry.name, DEMO_MINISTRY_NAME),
      ),
    })) ??
    (
      await db
        .insert(schema.ministry)
        .values({
          churchId: church.id,
          name: DEMO_MINISTRY_NAME,
          description: 'Seeded sample data for volunteer dashboard evaluation.',
          enforcementType: 'soft',
        })
        .returning()
    )[0];

  if (!ministry) {
    throw new Error('Unable to resolve demo ministry.');
  }

  const team =
    (await db.query.team.findFirst({
      where: and(
        eq(schema.team.churchId, church.id),
        eq(schema.team.ministryId, ministry.id),
        eq(schema.team.name, DEMO_TEAM_NAME),
      ),
    })) ??
    (
      await db
        .insert(schema.team)
        .values({
          churchId: church.id,
          ministryId: ministry.id,
          name: DEMO_TEAM_NAME,
        })
        .returning()
    )[0];

  if (!team) {
    throw new Error('Unable to resolve demo team.');
  }

  const membership = await db.query.ministryVolunteer.findFirst({
    where: and(
      eq(schema.ministryVolunteer.churchId, church.id),
      eq(schema.ministryVolunteer.ministryId, ministry.id),
      eq(schema.ministryVolunteer.volunteerId, volunteer.id),
    ),
  });

  if (!membership) {
    await db.insert(schema.ministryVolunteer).values({
      churchId: church.id,
      ministryId: ministry.id,
      volunteerId: volunteer.id,
      teamId: team.id,
      systemRole: 'volunteer',
      status: 'active',
    });
  }

  const hostRole =
    (await db.query.role.findFirst({
      where: and(
        eq(schema.role.churchId, church.id),
        eq(schema.role.ministryId, ministry.id),
        eq(schema.role.name, DEMO_ROLE_HOST),
      ),
    })) ??
    (
      await db
        .insert(schema.role)
        .values({
          churchId: church.id,
          ministryId: ministry.id,
          name: DEMO_ROLE_HOST,
          isGlobal: false,
        })
        .returning()
    )[0];

  const greeterRole =
    (await db.query.role.findFirst({
      where: and(
        eq(schema.role.churchId, church.id),
        eq(schema.role.ministryId, ministry.id),
        eq(schema.role.name, DEMO_ROLE_GREETER),
      ),
    })) ??
    (
      await db
        .insert(schema.role)
        .values({
          churchId: church.id,
          ministryId: ministry.id,
          name: DEMO_ROLE_GREETER,
          isGlobal: false,
        })
        .returning()
    )[0];

  if (!hostRole || !greeterRole) {
    throw new Error('Unable to resolve demo roles.');
  }

  return {
    user,
    church,
    volunteer,
    ministry,
    team,
    hostRole,
    greeterRole,
  };
}

function buildEventSpecs(now: Date): DemoEventPlan {
  const pendingStart = new Date(now);
  pendingStart.setDate(now.getDate() + 7);
  pendingStart.setHours(8, 0, 0, 0);

  const pendingEnd = new Date(pendingStart);
  pendingEnd.setHours(20, 0, 0, 0);

  const confirmedStart = new Date(now);
  confirmedStart.setDate(now.getDate() + 14);
  confirmedStart.setHours(19, 0, 0, 0);

  const confirmedEnd = new Date(confirmedStart);
  confirmedEnd.setHours(21, 0, 0, 0);

  return {
    pendingEvent: {
      title: DEMO_PENDING_EVENT_TITLE,
      startDate: pendingStart,
      endDate: pendingEnd,
      slots: [
        {
          label: '8:00 AM Service',
          startTime: new Date(pendingStart),
          endTime: new Date(pendingStart.getTime() + 90 * 60 * 1000),
        },
        {
          label: '10:30 AM Service',
          startTime: new Date(pendingStart.getTime() + 150 * 60 * 1000),
          endTime: new Date(pendingStart.getTime() + 240 * 60 * 1000),
        },
        {
          label: '6:30 PM Service',
          startTime: new Date(pendingStart.getTime() + 630 * 60 * 1000),
          endTime: new Date(pendingStart.getTime() + 720 * 60 * 1000),
        },
      ],
    },
    confirmedEvent: {
      title: DEMO_CONFIRMED_EVENT_TITLE,
      startDate: confirmedStart,
      endDate: confirmedEnd,
      slots: [
        {
          label: 'Prayer Team',
          startTime: confirmedStart,
          endTime: confirmedEnd,
        },
      ],
    },
  };
}

async function ensureEvent(context: DemoContext, spec: DemoEventSpec) {
  const event =
    (await db.query.event.findFirst({
      where: and(
        eq(schema.event.churchId, context.church.id),
        eq(schema.event.ministryId, context.ministry.id),
        eq(schema.event.title, spec.title),
      ),
    })) ??
    (
      await db
        .insert(schema.event)
        .values({
          churchId: context.church.id,
          ministryId: context.ministry.id,
          title: spec.title,
          description:
            'Seeded sample event for volunteer dashboard evaluation.',
          location: 'Main Auditorium',
          startDate: spec.startDate,
          endDate: spec.endDate,
          status: 'published',
          eventType: 'hourly',
        })
        .returning()
    )[0];

  if (!event) {
    throw new Error(`Unable to resolve demo event "${spec.title}".`);
  }

  const allowedLabels = new Set(spec.slots.map((slot) => slot.label));
  const existingSlots = await db
    .select()
    .from(schema.timeSlot)
    .where(
      and(
        eq(schema.timeSlot.churchId, context.church.id),
        eq(schema.timeSlot.eventId, event.id),
      ),
    );

  for (const existingSlot of existingSlots) {
    if (!allowedLabels.has(existingSlot.label ?? '')) {
      await db
        .delete(schema.timeSlot)
        .where(eq(schema.timeSlot.id, existingSlot.id));
    }
  }

  const slots = await Promise.all(
    spec.slots.map(async (slotSpec) => {
      const existingSlot = await db.query.timeSlot.findFirst({
        where: and(
          eq(schema.timeSlot.churchId, context.church.id),
          eq(schema.timeSlot.eventId, event.id),
          eq(schema.timeSlot.label, slotSpec.label),
        ),
      });

      const slot =
        existingSlot ??
        (
          await db
            .insert(schema.timeSlot)
            .values({
              churchId: context.church.id,
              eventId: event.id,
              label: slotSpec.label,
              startTime: slotSpec.startTime,
              endTime: slotSpec.endTime,
            })
            .returning()
        )[0];

      if (!slot) {
        throw new Error(`Unable to resolve demo slot "${slotSpec.label}".`);
      }

      if (
        existingSlot &&
        (existingSlot.startTime.getTime() !== slotSpec.startTime.getTime() ||
          existingSlot.endTime.getTime() !== slotSpec.endTime.getTime())
      ) {
        const [updatedSlot] = await db
          .update(schema.timeSlot)
          .set({
            startTime: slotSpec.startTime,
            endTime: slotSpec.endTime,
            label: slotSpec.label,
          })
          .where(eq(schema.timeSlot.id, existingSlot.id))
          .returning();

        if (!updatedSlot) {
          throw new Error(`Unable to update demo slot "${slotSpec.label}".`);
        }

        return updatedSlot;
      }

      return slot;
    }),
  );

  return { event, slots };
}

async function ensureSlotRequirement(
  context: DemoContext,
  slotId: string,
  roleId: string,
) {
  const existingRequirement = await db.query.slotRequirement.findFirst({
    where: and(
      eq(schema.slotRequirement.churchId, context.church.id),
      eq(schema.slotRequirement.slotId, slotId),
      eq(schema.slotRequirement.roleId, roleId),
    ),
  });

  if (existingRequirement) {
    return existingRequirement;
  }

  const [createdRequirement] = await db
    .insert(schema.slotRequirement)
    .values({
      churchId: context.church.id,
      slotId,
      roleId,
      teamId: context.team.id,
      requiredCount: 1,
      notes: 'Seeded dashboard demo requirement.',
    })
    .returning();

  if (!createdRequirement) {
    throw new Error('Unable to create demo slot requirement.');
  }

  return createdRequirement;
}

async function ensureAssignment(input: EnsureAssignmentInput) {
  const existingAssignment = await db.query.assignment.findFirst({
    where: and(
      eq(schema.assignment.churchId, input.context.church.id),
      eq(schema.assignment.slotId, input.slotId),
      eq(schema.assignment.volunteerId, input.context.volunteer.id),
    ),
  });

  if (existingAssignment) {
    return existingAssignment;
  }

  const [createdAssignment] = await db
    .insert(schema.assignment)
    .values({
      churchId: input.context.church.id,
      slotId: input.slotId,
      volunteerId: input.context.volunteer.id,
      roleId: input.roleId,
      status: input.status,
      assignedBy: input.context.user.id,
    })
    .returning();

  if (!createdAssignment) {
    throw new Error('Unable to create demo assignment.');
  }

  return createdAssignment;
}

async function ensureAvailability(input: EnsureAvailabilityInput) {
  const existingAvailability = await db.query.availability.findFirst({
    where: and(
      eq(schema.availability.churchId, input.context.church.id),
      eq(schema.availability.volunteerId, input.context.volunteer.id),
      eq(schema.availability.eventId, input.eventId),
      eq(schema.availability.startTime, input.startTime),
      eq(schema.availability.endTime, input.endTime),
    ),
  });

  if (existingAvailability) {
    return existingAvailability;
  }

  const [createdAvailability] = await db
    .insert(schema.availability)
    .values({
      churchId: input.context.church.id,
      volunteerId: input.context.volunteer.id,
      eventId: input.eventId,
      type: input.type,
      startTime: input.startTime,
      endTime: input.endTime,
      isAllDay: false,
      reason: 'Seeded dashboard demo availability.',
    })
    .returning();

  if (!createdAvailability) {
    throw new Error('Unable to create demo availability.');
  }

  return createdAvailability;
}

async function ensureNotification(input: EnsureNotificationInput) {
  const existingNotification = await db.query.volunteerNotification.findFirst({
    where: and(
      eq(schema.volunteerNotification.churchId, input.context.church.id),
      eq(schema.volunteerNotification.volunteerId, input.context.volunteer.id),
      eq(schema.volunteerNotification.title, input.title),
    ),
  });

  if (existingNotification) {
    return existingNotification;
  }

  const [createdNotification] = await db
    .insert(schema.volunteerNotification)
    .values({
      churchId: input.context.church.id,
      volunteerId: input.context.volunteer.id,
      ministryId: input.context.ministry.id,
      eventId: input.eventId,
      assignmentId: input.assignmentId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: {
        ministryId: input.context.ministry.id,
        eventId: input.eventId ?? null,
        assignmentId: input.assignmentId ?? null,
      },
      readAt: input.readAt,
    })
    .returning();

  if (!createdNotification) {
    throw new Error('Unable to create demo notification.');
  }

  return createdNotification;
}

export async function seedVolunteerDashboardDemo(email?: string) {
  const user = await resolveTargetUser(email);
  const context = await ensureVolunteerContext(user);
  const now = new Date();
  const { pendingEvent, confirmedEvent } = buildEventSpecs(now);
  const pending = await ensureEvent(context, pendingEvent);
  const confirmed = await ensureEvent(context, confirmedEvent);

  await Promise.all(
    pending.slots.map((slot) =>
      ensureSlotRequirement(context, slot.id, context.hostRole.id),
    ),
  );
  await Promise.all(
    confirmed.slots.map((slot) =>
      ensureSlotRequirement(context, slot.id, context.greeterRole.id),
    ),
  );

  const pendingAssignment = await ensureAssignment({
    context,
    slotId: pending.slots[0]?.id ?? '',
    roleId: context.hostRole.id,
    status: 'pending',
  });
  const confirmedAssignment = await ensureAssignment({
    context,
    slotId: confirmed.slots[0]?.id ?? '',
    roleId: context.greeterRole.id,
    status: 'confirmed',
  });

  await ensureAvailability({
    context,
    eventId: pending.event.id,
    startTime: pending.slots[0]?.startTime ?? pending.event.startDate,
    endTime: pending.slots[0]?.endTime ?? pending.event.endDate,
    type: 'available',
  });

  await ensureAvailability({
    context,
    eventId: confirmed.event.id,
    startTime: confirmed.slots[0]?.startTime ?? confirmed.event.startDate,
    endTime: confirmed.slots[0]?.endTime ?? confirmed.event.endDate,
    type: 'available',
  });

  await ensureNotification({
    context,
    title: 'New assignment waiting for your response',
    body: `You were assigned as ${context.hostRole.name} for ${pending.event.title}.`,
    type: 'assignment_added',
    eventId: pending.event.id,
    assignmentId: pendingAssignment.id,
  });
  await ensureNotification({
    context,
    title: 'Availability still needed',
    body: `Finish your availability for ${confirmed.event.title}.`,
    type: 'availability_reminder',
    eventId: confirmed.event.id,
  });
  await ensureNotification({
    context,
    title: 'Schedule published',
    body: `${confirmed.event.title} is now visible on your dashboard.`,
    type: 'schedule_published',
    eventId: confirmed.event.id,
  });
  await ensureNotification({
    context,
    title: 'Reminder: upcoming service',
    body: `${pending.event.title} starts in one week.`,
    type: 'assignment_reminder',
    eventId: pending.event.id,
    assignmentId: confirmedAssignment.id,
    readAt: new Date(),
  });

  return {
    email: user.email,
    church: context.church.name,
    volunteerId: context.volunteer.id,
    ministry: context.ministry.name,
    seededEvents: [pending.event.title, confirmed.event.title],
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const result = await seedVolunteerDashboardDemo(options.email);

  console.log('Seeded volunteer dashboard demo data:');
  console.log(`- email: ${result.email}`);
  console.log(`- church: ${result.church}`);
  console.log(`- ministry: ${result.ministry}`);
  console.log(`- volunteerId: ${result.volunteerId}`);
  console.log(`- events: ${result.seededEvents.join(', ')}`);
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to seed volunteer dashboard demo data.');
      console.error(error);
      process.exit(1);
    });
}
