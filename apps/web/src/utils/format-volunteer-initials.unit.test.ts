import { describe, expect, it } from 'vitest';
import { formatVolunteerInitials } from './format-volunteer-initials';

describe('formatVolunteerInitials', () => {
  it('takes the first and last initial', () => {
    expect(formatVolunteerInitials({ volunteerName: 'Carla Mendes' })).toBe(
      'CM',
    );
  });

  it('ignores middle names', () => {
    expect(formatVolunteerInitials({ volunteerName: 'Ana Maria Costa' })).toBe(
      'AC',
    );
  });

  it('yields a single initial for a one-token name', () => {
    expect(formatVolunteerInitials({ volunteerName: 'Madonna' })).toBe('M');
  });

  it('collapses extra whitespace', () => {
    expect(
      formatVolunteerInitials({ volunteerName: '  Carla   Mendes  ' }),
    ).toBe('CM');
  });

  it('never renders a blank avatar', () => {
    expect(formatVolunteerInitials({ volunteerName: '   ' })).toBe('?');
    expect(formatVolunteerInitials({ volunteerName: null })).toBe('?');
    expect(formatVolunteerInitials({ volunteerName: undefined })).toBe('?');
  });
});
