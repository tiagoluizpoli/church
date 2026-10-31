import { NotFoundError } from '@church/core';
import { parseInstant } from '@church/time';
import type {
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
} from '@/domain/branded-ids';
import type {
  FindVolunteerByUserIdGloballyInput,
  FindVolunteerByUserIdInput,
  GetVolunteerByIdInput,
  HasLeadershipInMinistryInput,
  HasMembershipInMinistryInput,
  HasRoleQualificationInput,
  ListLedMinistriesInput,
  ListMemberMinistryIdsInput,
  ListMinistryMembershipsInput,
  ListQualifiedVolunteersForRoleInput,
  ListVolunteersByIdsInput,
  ListVolunteersByMinistryInput,
  MinistryMembership,
  UpdateVolunteerStatusInput,
  VolunteerRepository,
} from '@/domain/contracts/infrastructure/volunteer.repository';
import { Volunteer } from '@/domain/entities/volunteer';
import { runVolunteerRepositoryContractTests } from '@/tests/domain/contracts/contract-tests/volunteer.contract-spec';

class MockVolunteerRepository implements VolunteerRepository {
  private volunteers = new Map<string, Volunteer>();
  private memberships = new Set<string>(); // "volunteerId:ministryId"
  private qualifications = new Set<string>(); // "volunteerId:roleId"

  constructor() {
    const v1 = new Volunteer({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        userId: '22222222-2222-2222-2222-222222222221' as UserId,
        status: 'active',
      },
      id: '44444444-4444-4444-4444-444444444441' as VolunteerId,
    });
    const v2 = new Volunteer({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        userId: '22222222-2222-2222-2222-222222222222' as UserId,
        status: 'active',
      },
      id: '44444444-4444-4444-4444-444444444442' as VolunteerId,
    });
    const v3Retired = new Volunteer({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        userId: '22222222-2222-2222-2222-222222222223' as UserId,
        status: 'active',
        leftAt: parseInstant({ value: '2024-01-01T00:00:00Z' }),
      },
      id: '44444444-4444-4444-4444-444444444443' as VolunteerId,
    });

    this.volunteers.set(v1.id, v1);
    this.volunteers.set(v2.id, v2);
    this.volunteers.set(v3Retired.id, v3Retired);

    this.memberships.add(
      '44444444-4444-4444-4444-444444444441:33333333-3333-3333-3333-333333333331',
    );
    this.qualifications.add(
      '44444444-4444-4444-4444-444444444441:55555555-5555-5555-5555-555555555551',
    );
  }

  async getById({ churchId, id }: GetVolunteerByIdInput): Promise<Volunteer> {
    const v = this.volunteers.get(id);
    if (!v || v.churchId !== churchId) {
      throw new NotFoundError('Volunteer not found');
    }
    return v;
  }

  async findByUserId({
    churchId,
    userId,
  }: FindVolunteerByUserIdInput): Promise<Volunteer | null> {
    for (const v of this.volunteers.values()) {
      if (v.churchId === churchId && v.userId === userId && !v.isRetired) {
        return v;
      }
    }
    return null;
  }

  async listByMinistry({
    churchId,
    ministryId,
  }: ListVolunteersByMinistryInput): Promise<Volunteer[]> {
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

  async hasMembershipInMinistry({
    volunteerId,
    ministryId,
  }: HasMembershipInMinistryInput): Promise<boolean> {
    return this.memberships.has(`${volunteerId}:${ministryId}`);
  }

  async hasRoleQualification({
    volunteerId,
    ministryId,
    roleId,
  }: HasRoleQualificationInput): Promise<boolean> {
    return (
      this.memberships.has(`${volunteerId}:${ministryId}`) &&
      this.qualifications.has(`${volunteerId}:${roleId}`)
    );
  }

  async listQualifiedForRole({
    churchId,
    ministryId,
    roleId,
  }: ListQualifiedVolunteersForRoleInput): Promise<Volunteer[]> {
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

  async updateStatus({
    churchId,
    volunteerId,
    status,
  }: UpdateVolunteerStatusInput): Promise<void> {
    const v = await this.getById({ churchId, id: volunteerId });
    if (status === 'active') {
      v.activate();
    } else if (status === 'inactive') {
      v.deactivate();
    } else if (status === 'on_hold') {
      v.putOnHold();
    }
  }

  async findByUserIdGlobally({
    userId,
  }: FindVolunteerByUserIdGloballyInput): Promise<Volunteer | null> {
    for (const v of this.volunteers.values()) {
      if (v.userId === userId && !v.isRetired) return v;
    }
    return null;
  }

  async hasLeadershipInMinistry({
    volunteerId,
    ministryId,
  }: HasLeadershipInMinistryInput): Promise<boolean> {
    return this.memberships.has(`${volunteerId}:${ministryId}:leader`);
  }

  async listLedMinistries(
    _input: ListLedMinistriesInput,
  ): Promise<{ ministryId: MinistryId; ministryName: string }[]> {
    return [];
  }

  async listByIds({
    churchId,
    ids,
  }: ListVolunteersByIdsInput): Promise<Volunteer[]> {
    return ids
      .map((id) => this.volunteers.get(id))
      .filter((v): v is Volunteer => v != null && v.churchId === churchId);
  }

  async listMemberMinistryIds({
    volunteerId,
  }: ListMemberMinistryIdsInput): Promise<MinistryId[]> {
    const results: MinistryId[] = [];
    for (const key of this.memberships) {
      const [vid, mid] = key.split(':');
      if (vid === volunteerId) results.push(mid as MinistryId);
    }
    return results;
  }

  async listMinistryMemberships(
    _input: ListMinistryMembershipsInput,
  ): Promise<MinistryMembership[]> {
    return [];
  }

  async isChurchAdmin(): Promise<boolean> {
    return false;
  }

  async listActiveLeaderEmails(): Promise<string[]> {
    return [];
  }

  async listActiveLeaderUserIds(): Promise<never[]> {
    return [];
  }
}

runVolunteerRepositoryContractTests(
  async () => new MockVolunteerRepository(),
  async () => {},
);
