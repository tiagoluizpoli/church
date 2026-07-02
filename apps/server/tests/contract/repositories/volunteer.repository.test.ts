import { NotFoundError } from '@church/core';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { runVolunteerRepositoryContractTests } from '../../../src/domain/contracts/contract-tests/volunteer.contract-spec';
import type {
  MinistryMembership,
  VolunteerRepository,
} from '../../../src/domain/contracts/infrastructure/volunteer.repository';
import {
  Volunteer,
  type VolunteerStatus,
} from '../../../src/domain/entities/volunteer';

class MockVolunteerRepository implements VolunteerRepository {
  private volunteers = new Map<string, Volunteer>();
  private memberships = new Set<string>(); // "volunteerId:ministryId"
  private qualifications = new Set<string>(); // "volunteerId:roleId"

  constructor() {
    const v1 = new Volunteer(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        userId: '22222222-2222-2222-2222-222222222221' as UserId,
        status: 'active',
      },
      '44444444-4444-4444-4444-444444444441' as VolunteerId,
    );
    const v2 = new Volunteer(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        userId: '22222222-2222-2222-2222-222222222222' as UserId,
        status: 'active',
      },
      '44444444-4444-4444-4444-444444444442' as VolunteerId,
    );

    this.volunteers.set(v1.id, v1);
    this.volunteers.set(v2.id, v2);

    this.memberships.add(
      '44444444-4444-4444-4444-444444444441:33333333-3333-3333-3333-333333333331',
    );
    this.qualifications.add(
      '44444444-4444-4444-4444-444444444441:55555555-5555-5555-5555-555555555551',
    );
  }

  async getById(churchId: ChurchId, id: VolunteerId): Promise<Volunteer> {
    const v = this.volunteers.get(id);
    if (!v || v.churchId !== churchId) {
      throw new NotFoundError('Volunteer not found');
    }
    return v;
  }

  async findByUserId(
    churchId: ChurchId,
    userId: UserId,
  ): Promise<Volunteer | null> {
    for (const v of this.volunteers.values()) {
      if (v.churchId === churchId && v.userId === userId) {
        return v;
      }
    }
    return null;
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
  ): Promise<Volunteer[]> {
    const list: Volunteer[] = [];
    for (const v of this.volunteers.values()) {
      if (
        v.churchId === churchId &&
        this.memberships.has(`${v.id}:${ministryId}`)
      ) {
        list.push(v);
      }
    }
    return list;
  }

  async hasMembershipInMinistry(
    _churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
  ): Promise<boolean> {
    return this.memberships.has(`${volunteerId}:${ministryId}`);
  }

  async hasRoleQualification(
    _churchId: ChurchId,
    volunteerId: VolunteerId,
    roleId: RoleId,
  ): Promise<boolean> {
    return this.qualifications.has(`${volunteerId}:${roleId}`);
  }

  async listQualifiedForRole(
    churchId: ChurchId,
    ministryId: MinistryId,
    roleId: RoleId,
  ): Promise<Volunteer[]> {
    const list: Volunteer[] = [];
    for (const v of this.volunteers.values()) {
      if (
        v.churchId === churchId &&
        this.memberships.has(`${v.id}:${ministryId}`) &&
        this.qualifications.has(`${v.id}:${roleId}`)
      ) {
        list.push(v);
      }
    }
    return list;
  }

  async updateStatus(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    status: VolunteerStatus,
  ): Promise<void> {
    const v = await this.getById(churchId, volunteerId);
    if (status === 'active') {
      v.activate();
    } else if (status === 'inactive') {
      v.deactivate();
    } else if (status === 'on_hold') {
      v.putOnHold();
    }
  }

  async findByUserIdGlobally(userId: UserId): Promise<Volunteer | null> {
    for (const v of this.volunteers.values()) {
      if (v.userId === userId) return v;
    }
    return null;
  }

  async hasLeadershipInMinistry(
    _churchId: ChurchId,
    volunteerId: VolunteerId,
    ministryId: MinistryId,
  ): Promise<boolean> {
    return this.memberships.has(`${volunteerId}:${ministryId}:leader`);
  }

  async listLedMinistries(
    _churchId: ChurchId,
    _volunteerId: VolunteerId,
  ): Promise<{ ministryId: MinistryId; ministryName: string }[]> {
    return [];
  }

  async listByIds(
    churchId: ChurchId,
    ids: VolunteerId[],
  ): Promise<Volunteer[]> {
    return ids
      .map((id) => this.volunteers.get(id))
      .filter((v): v is Volunteer => v != null && v.churchId === churchId);
  }

  async listMemberMinistryIds(
    _churchId: ChurchId,
    volunteerId: VolunteerId,
  ): Promise<MinistryId[]> {
    const results: MinistryId[] = [];
    for (const key of this.memberships) {
      const [vid, mid] = key.split(':');
      if (vid === volunteerId) results.push(mid as MinistryId);
    }
    return results;
  }

  async listMinistryMemberships(
    _churchId: ChurchId,
    _ministryId: MinistryId,
  ): Promise<MinistryMembership[]> {
    return [];
  }
}

runVolunteerRepositoryContractTests(
  async () => new MockVolunteerRepository(),
  async () => {},
);
