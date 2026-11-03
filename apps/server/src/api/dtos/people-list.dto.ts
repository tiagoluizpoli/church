import { instantSchema } from '@church/time';
import { z } from 'zod';
import { CHURCH_ACCESS_LEVEL_OPTIONS } from '../../domain/authority/types';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import { PEOPLE_ACCESS_OPTIONS } from '../../domain/entities/people-list-item';
import { decodePeopleListCursor } from '../../domain/people-list-cursor';

export const peopleListResponseSchema = z.object({
  items: z.array(
    z.object({
      /** Church Membership id: opaque, not a Volunteer or User id. */
      id: z.string(),
      name: z.string(),
      email: z.string(),
      isAdmin: z.boolean(),
      ministries: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
        }),
      ),
    }),
  ),
  nextCursor: z.string().optional(),
  /** Pickers limited to the Ministries the caller may see. */
  options: z.object({
    ministries: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const peopleListQuerystringSchema = z.object({
  search: z.string().trim().min(1).max(254).optional(),
  ministryId: z.string().uuid().optional(),
  access: z.enum(PEOPLE_ACCESS_OPTIONS).optional(),
  cursor: z
    .string()
    .refine((cursor) => decodePeopleListCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
});

export const personParamsSchema = z.object({ memberId: z.string().min(1) });

const personDetailRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
});

export const personDetailResponseSchema = z.object({
  /** Church Membership id: opaque, not a Volunteer or User id. */
  id: z.string(),
  name: z.string(),
  email: z.string(),
  ministries: z.array(
    z.object({
      membershipId: z.string(),
      ministryId: z.string(),
      ministryName: z.string(),
      ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
      roles: z.array(personDetailRoleSchema),
      /** Gatekeeper-derived hint for the Edit Roles action; the mutation authorizes on its own. */
      canEditRoles: z.boolean(),
      /** Gatekeeper-derived hint for Remove from Ministry; the mutation authorizes on its own. */
      canEndMembership: z.boolean(),
      /** Same, for Make leader / Make volunteer. */
      canChangeMinistryAccess: z.boolean(),
    }),
  ),
  /** Presentation hints; false grants nothing and true is never trusted back. */
  canChangeChurchAccess: z.boolean(),
  canInviteToMinistry: z.boolean(),
  /** ChurchAdmin only; absent for Ministry leaders. */
  churchAccess: z
    .object({
      accessLevel: z.enum(['member', 'admin']),
      isLastAdmin: z.boolean(),
      /** The member is the caller; demoting them ends the caller's own administration. */
      isSelf: z.boolean(),
    })
    .optional(),
});

export const churchAccessChangeBodySchema = z.object({
  accessLevel: z.enum(CHURCH_ACCESS_LEVEL_OPTIONS),
});

export const churchAccessChangeResponseSchema = z.object({
  memberId: z.string(),
  accessLevel: z.enum(CHURCH_ACCESS_LEVEL_OPTIONS),
  /** False when the member already had the requested access; nothing was written. */
  changed: z.boolean(),
});

export const ministryMembershipParamsSchema = z.object({
  memberId: z.string().min(1),
  membershipId: z.string().min(1),
});

/** Far above any Ministry's Role catalog; only bounds the request. */
const MAX_ROLE_IDS_PER_REQUEST = 200;

export const setMinistryRolesBodySchema = z.object({
  /** The complete set; omitted Roles are removed. */
  roleIds: z.array(z.string().uuid()).max(MAX_ROLE_IDS_PER_REQUEST),
});

export const changeMinistryAccessBodySchema = z.object({
  accessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
  /** The complete replacement set; omitted keeps the held Roles. */
  roleIds: z.array(z.string().uuid()).max(MAX_ROLE_IDS_PER_REQUEST).optional(),
});

export const ministryMembershipChangeResponseSchema = z.object({
  memberId: z.string(),
  membershipId: z.string(),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS),
  roles: z.array(personDetailRoleSchema),
  /** False when the membership already matched; nothing was written. */
  changed: z.boolean(),
});

export const endMinistryMembershipResponseSchema = z.object({
  memberId: z.string(),
  membershipId: z.string(),
  status: z.literal('inactive'),
  leftAt: instantSchema,
  changed: z.literal(true),
});

export const upcomingAssignmentSchema = z.object({
  assignmentId: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  eventTimeBlockId: z.string(),
  shiftId: z.string(),
  shiftStart: instantSchema,
  shiftEnd: instantSchema,
  roleId: z.string(),
  roleName: z.string(),
  sectorId: z.string(),
  sectorName: z.string(),
  ministryId: z.string(),
  cycleId: z.string(),
});

/** A 409 `UPCOMING_ASSIGNMENTS`: the localized envelope plus every blocking Assignment. */
export const upcomingAssignmentsResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  assignments: z.array(upcomingAssignmentSchema),
});
