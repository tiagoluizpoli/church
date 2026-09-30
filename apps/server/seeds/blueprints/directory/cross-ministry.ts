import { ESTACIONAMENTO } from './estacionamento';
import { INTERCESSAO } from './intercessao';
import { KIDS } from './kids';
import { PROJECAO } from './projecao';
import { joinMinistry } from './types';

/**
 * The 25 people who deliberately serve in a second Ministry, so two Ministries
 * can try to schedule the same person at the same gathering. Each is declared
 * in their first Ministry's roster; this adds only the extra seat.
 */
export const CROSS_MINISTRY = [
  joinMinistry({
    ministry: PROJECAO,
    seat: { roles: ['Operador de Projeção'] },
    emails: [
      'beatriz.ferreira@igreja-semente.test', // Kids
      'caio.martins@igreja-semente.test', // Kids
      'joao.pereira@igreja-semente.test', // Intercessão
    ],
  }),
  joinMinistry({
    ministry: KIDS,
    seat: { roles: ['Auxiliar'], teams: [{ team: 'Kids' }] },
    emails: [
      'larissa.soares@igreja-semente.test', // Intercessão
      'mateus.batista@igreja-semente.test', // Intercessão
      'natalia.queiroz@igreja-semente.test', // Intercessão
      'otavio.correia@igreja-semente.test', // Intercessão
      'fernanda.guimaraes@igreja-semente.test', // Estacionamento
      'gustavo.cardoso@igreja-semente.test', // Estacionamento
    ],
  }),
  joinMinistry({
    ministry: KIDS,
    seat: { roles: ['Auxiliar'], teams: [{ team: 'Maternal' }] },
    emails: [
      'patricia.gomes@igreja-semente.test', // Intercessão
      'ricardo.mendes@igreja-semente.test', // Intercessão
      'bruno.dias@igreja-semente.test', // Projeção
      'carla.lopes@igreja-semente.test', // Projeção
    ],
  }),
  joinMinistry({
    ministry: INTERCESSAO,
    seat: { roles: ['Intercessor'] },
    emails: [
      'camila.oliveira@igreja-semente.test', // Kids
      'diego.silva@igreja-semente.test', // Kids
      'elisa.azevedo@igreja-semente.test', // Kids
      'fabio.pacheco@igreja-semente.test', // Kids
      'fernanda.castro@igreja-semente.test', // Kids
      'heloisa.fernandes@igreja-semente.test', // Estacionamento
      'igor.machado@igreja-semente.test', // Estacionamento
      'juliana.nogueira@igreja-semente.test', // Estacionamento
    ],
  }),
  joinMinistry({
    ministry: ESTACIONAMENTO,
    seat: { roles: ['Orientador de Estacionamento'] },
    emails: [
      'sabrina.pinto@igreja-semente.test', // Intercessão
      'thiago.souza@igreja-semente.test', // Intercessão
      'gustavo.freitas@igreja-semente.test', // Kids
      'heloisa.medeiros@igreja-semente.test', // Kids
    ],
  }),
] as const;
