import { fromDate, instantSchema } from '@church/time';
import { z } from 'zod';
import {
  INVITATION_EMAIL_STATE_OPTIONS,
  INVITATION_INVITED_AS_OPTIONS,
  INVITATION_LIST_KIND_OPTIONS,
  INVITATION_LIST_STATUS_OPTIONS,
  type InvitationListItem,
  type InvitationListPage,
} from '../../domain/entities/invitation-list-item';
import { MINISTRY_ACCESS_LEVEL_OPTIONS } from '../../domain/entities/ministry-membership';
import { decodeInvitationListCursor } from '../../domain/invitation-list-cursor';

export const invitationListItemResponseSchema = z.object({
  /** With `id`, the stable tagged row identity: a Ministry offer and a Church grant never collide. */
  kind: z.enum(INVITATION_LIST_KIND_OPTIONS),
  id: z.string(),
  /** Admin callers only: the Church Invitation this row is, or is paired with. */
  churchInvitationId: z.string().optional(),
  ministryId: z.string().optional(),
  ministryName: z.string().optional(),
  email: z.string(),
  /** Admin callers only: the Church-wide grant this offer carries. */
  churchAccessLevel: z.literal('admin').optional(),
  ministryAccessLevel: z.enum(MINISTRY_ACCESS_LEVEL_OPTIONS).optional(),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  invitedBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: instantSchema,
  expiresAt: instantSchema,
  /** The stored lifecycle state; an expired offer is still `pending`. */
  status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
  /** Derived at read time against the clock; never persisted. */
  displayStatus: z.enum(INVITATION_LIST_STATUS_OPTIONS),
  /** Closed offers only; each field appears only when actually recorded. */
  closure: z
    .object({
      actor: z.object({ id: z.string(), name: z.string() }).optional(),
      at: instantSchema.optional(),
      reason: z.string().optional(),
    })
    .optional(),
  emailDelivery: z.object({
    state: z.enum(INVITATION_EMAIL_STATE_OPTIONS),
    /** Set only when the sender confirmed the email. */
    sentAt: instantSchema.optional(),
  }),
});
export type InvitationListItemResponse = z.infer<
  typeof invitationListItemResponseSchema
>;

export const invitationListResponseSchema = z.object({
  items: z.array(invitationListItemResponseSchema),
  nextCursor: z.string().optional(),
  /** Pickers limited to what the caller's authority reaches. */
  options: z.object({
    ministries: z.array(z.object({ id: z.string(), name: z.string() })),
    invitedAs: z.array(z.enum(INVITATION_INVITED_AS_OPTIONS)),
  }),
});

export const invitationListQuerystringSchema = z.object({
  status: z.enum(INVITATION_LIST_STATUS_OPTIONS).default('pending'),
  ministryId: z.string().uuid().optional(),
  invitedAs: z.enum(INVITATION_INVITED_AS_OPTIONS).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  cursor: z
    .string()
    .refine((cursor) => decodeInvitationListCursor({ cursor }) !== undefined, {
      message: 'Invalid cursor',
    })
    .optional(),
  limit: z.coerce.number().int().positive().optional(),
});

function toItemResponse(item: InvitationListItem): InvitationListItemResponse {
  const { createdAt, expiresAt, emailDelivery, closure, ...rest } = item;
  return {
    ...rest,
    closure: closure && {
      ...closure,
      at: closure.at ? fromDate({ date: closure.at }) : undefined,
    },
    createdAt: fromDate({ date: createdAt }),
    expiresAt: fromDate({ date: expiresAt }),
    emailDelivery: {
      state: emailDelivery.state,
      sentAt: emailDelivery.sentAt
        ? fromDate({ date: emailDelivery.sentAt })
        : undefined,
    },
  };
}

export const invitationListMapper = {
  toResponse(page: InvitationListPage) {
    return {
      items: page.items.map(toItemResponse),
      nextCursor: page.nextCursor,
      options: page.options,
    };
  },
};
