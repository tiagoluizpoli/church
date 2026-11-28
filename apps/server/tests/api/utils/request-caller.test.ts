import { describe, expect, it } from 'vitest';
import { requestCaller } from '@/api/utils/request-caller';

describe('requestCaller', () => {
  it('reads the Church, User and actor that Active Church resolution set, and nothing else', () => {
    const actor = { userId: 'usr_1', churchId: 'chu_1' };
    const request = {
      churchId: 'chu_1',
      userId: 'usr_1',
      volunteerId: 'vol_1',
      actor,
      locale: 'pt-BR',
    };

    const caller = requestCaller({ request: request as never });

    expect(caller).toStrictEqual({
      churchId: 'chu_1',
      userId: 'usr_1',
      actor,
    });
    expect(caller.actor).toBe(actor);
  });

  it('leaves actor undefined where no resolver supplied one', () => {
    const request = { churchId: 'chu_1', userId: 'usr_1' };

    expect(requestCaller({ request: request as never })).toStrictEqual({
      churchId: 'chu_1',
      userId: 'usr_1',
      actor: undefined,
    });
  });
});
