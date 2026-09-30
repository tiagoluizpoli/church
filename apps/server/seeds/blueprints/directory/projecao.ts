import { defineMinistry } from './types';

/** Projeção runs projection in the Templo and in Kids. Until #319 its two placements are one Operador de Projeção requirement, so it has no Teams. */
export const PROJECAO = defineMinistry({
  name: 'Projeção',
  roles: ['Operador de Projeção'],
  teams: [],
  roster: [
    // Ministry leader (1)
    {
      seat: { ministryLeader: true, roles: ['Operador de Projeção'] },
      people: [
        { name: 'Ana Almeida', email: 'ana.almeida@igreja-semente.test' },
      ],
    },
    // Operadores (11)
    {
      seat: { roles: ['Operador de Projeção'] },
      people: [
        { name: 'Bruno Dias', email: 'bruno.dias@igreja-semente.test' },
        { name: 'Carla Lopes', email: 'carla.lopes@igreja-semente.test' },
        { name: 'Daniel Moreira', email: 'daniel.moreira@igreja-semente.test' },
        {
          name: 'Eduarda Ribeiro',
          email: 'eduarda.ribeiro@igreja-semente.test',
        },
        {
          name: 'Felipe Vasconcelos',
          email: 'felipe.vasconcelos@igreja-semente.test',
        },
        {
          name: 'Gabriela Fonseca',
          email: 'gabriela.fonseca@igreja-semente.test',
        },
        {
          name: 'Henrique Barbosa',
          email: 'henrique.barbosa@igreja-semente.test',
        },
        { name: 'Isabela Farias', email: 'isabela.farias@igreja-semente.test' },
        { name: 'João Macedo', email: 'joao.macedo@igreja-semente.test' },
        {
          name: 'Larissa Nascimento',
          email: 'larissa.nascimento@igreja-semente.test',
        },
        { name: 'Mateus Rocha', email: 'mateus.rocha@igreja-semente.test' },
      ],
    },
  ],
});
