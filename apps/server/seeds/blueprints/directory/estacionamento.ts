import { defineMinistry } from './types';

/** Estacionamento guides the car park; a served block needs 4 Orientadores. */
export const ESTACIONAMENTO = defineMinistry({
  name: 'Estacionamento',
  roles: ['Orientador de Estacionamento'],
  teams: [],
  roster: [
    // Ministry leader (1)
    {
      seat: { ministryLeader: true, roles: ['Orientador de Estacionamento'] },
      people: [
        { name: 'Fábio Viana', email: 'fabio.viana@igreja-semente.test' },
      ],
    },
    // Orientadores (35)
    {
      seat: { roles: ['Orientador de Estacionamento'] },
      people: [
        {
          name: 'Fernanda Guimarães',
          email: 'fernanda.guimaraes@igreja-semente.test',
        },
        {
          name: 'Gustavo Cardoso',
          email: 'gustavo.cardoso@igreja-semente.test',
        },
        {
          name: 'Heloísa Fernandes',
          email: 'heloisa.fernandes@igreja-semente.test',
        },
        { name: 'Igor Machado', email: 'igor.machado@igreja-semente.test' },
        {
          name: 'Juliana Nogueira',
          email: 'juliana.nogueira@igreja-semente.test',
        },
        {
          name: 'Leonardo Santos',
          email: 'leonardo.santos@igreja-semente.test',
        },
        { name: 'Letícia Xavier', email: 'leticia.xavier@igreja-semente.test' },
        { name: 'Marcelo Leal', email: 'marcelo.leal@igreja-semente.test' },
        {
          name: 'Mariana Carvalho',
          email: 'mariana.carvalho@igreja-semente.test',
        },
        {
          name: 'Nicolas Ferreira',
          email: 'nicolas.ferreira@igreja-semente.test',
        },
        { name: 'Paula Martins', email: 'paula.martins@igreja-semente.test' },
        { name: 'Pedro Oliveira', email: 'pedro.oliveira@igreja-semente.test' },
        { name: 'Raquel Silva', email: 'raquel.silva@igreja-semente.test' },
        { name: 'Renato Azevedo', email: 'renato.azevedo@igreja-semente.test' },
        { name: 'Sofia Pacheco', email: 'sofia.pacheco@igreja-semente.test' },
        { name: 'Samuel Castro', email: 'samuel.castro@igreja-semente.test' },
        {
          name: 'Tatiane Freitas',
          email: 'tatiane.freitas@igreja-semente.test',
        },
        { name: 'Tiago Medeiros', email: 'tiago.medeiros@igreja-semente.test' },
        {
          name: 'Valéria Pereira',
          email: 'valeria.pereira@igreja-semente.test',
        },
        { name: 'Wesley Soares', email: 'wesley.soares@igreja-semente.test' },
        { name: 'Yasmin Batista', email: 'yasmin.batista@igreja-semente.test' },
        { name: 'Alice Queiroz', email: 'alice.queiroz@igreja-semente.test' },
        { name: 'Arthur Correia', email: 'arthur.correia@igreja-semente.test' },
        { name: 'Bianca Gomes', email: 'bianca.gomes@igreja-semente.test' },
        { name: 'Cláudio Mendes', email: 'claudio.mendes@igreja-semente.test' },
        { name: 'Débora Pinto', email: 'debora.pinto@igreja-semente.test' },
        { name: 'Emanuel Souza', email: 'emanuel.souza@igreja-semente.test' },
        { name: 'Flávia Campos', email: 'flavia.campos@igreja-semente.test' },
        {
          name: 'Gilberto Rezende',
          email: 'gilberto.rezende@igreja-semente.test',
        },
        { name: 'Ingrid Costa', email: 'ingrid.costa@igreja-semente.test' },
        { name: 'Jéssica Lima', email: 'jessica.lima@igreja-semente.test' },
        {
          name: 'Kaique Monteiro',
          email: 'kaique.monteiro@igreja-semente.test',
        },
        { name: 'Lorena Ramos', email: 'lorena.ramos@igreja-semente.test' },
        {
          name: 'Márcio Teixeira',
          email: 'marcio.teixeira@igreja-semente.test',
        },
        { name: 'Nathan Cunha', email: 'nathan.cunha@igreja-semente.test' },
      ],
    },
  ],
});
