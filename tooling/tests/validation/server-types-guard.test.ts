import { describe, expect, it } from 'bun:test';
import { getServerTypeDeclarations } from '../../validation/server-types-guard';

const SOURCE = `export interface CreateInput { id: string }
export type CreateResult = { id: string };
export class Create {
  run(input: CreateInput): CreateResult {
    type Local = string;
    const id: Local = input.id;
    return { id };
  }
}
`;

const INTERFACE_ONLY = 'export interface CreateInput { id: string }\n';

const declarationsIn = (paths: string[], source = INTERFACE_ONLY) =>
  getServerTypeDeclarations({
    files: paths.map((path) => ({ path, source })),
  });

describe('server types guard', () => {
  it('flags every interface and type alias in an application file', () => {
    const path = 'apps/server/src/application/church/create-church.ts';
    expect(declarationsIn([path], SOURCE)).toEqual([
      `${path}:1: interface CreateInput`,
      `${path}:2: type CreateResult`,
      `${path}:5: type Local`,
    ]);
  });

  it('flags a repository and every other checked folder', () => {
    const paths = [
      'apps/server/src/infrastructure/repositories/drizzle-church.repository.ts',
      'apps/server/src/infrastructure/mappers/church.mapper.ts',
      'apps/server/src/api/controllers/church.controller.ts',
      'apps/server/src/domain/services/shift-splitter.ts',
      'apps/server/src/main/di/container.ts',
    ];
    expect(declarationsIn(paths)).toEqual(
      paths.map((path) => `${path}:1: interface CreateInput`),
    );
  });

  it('ignores contracts, entities, errors, .types.ts siblings, DTOs and unchecked paths', () => {
    expect(
      declarationsIn([
        'apps/server/src/domain/contracts/application/create-church.ts',
        'apps/server/src/domain/contracts/infrastructure/church.repository.ts',
        'apps/server/src/domain/entities/church.ts',
        'apps/server/src/domain/errors/church-errors.ts',
        'apps/server/src/infrastructure/repositories/drizzle-church.repository.types.ts',
        'apps/server/src/domain/services/assignment-eligibility.types.ts',
        'apps/server/src/api/dtos/church.dto.ts',
        'apps/server/src/api/contracts/fastify-request.d.ts',
        'apps/server/src/domain/recurrence.ts',
        'apps/server/src/scripts/seed.ts',
        'apps/server/tests/application/church/create-church.test.ts',
        'apps/web/src/application/church/create-church.ts',
      ]),
    ).toEqual([]);
  });
});
