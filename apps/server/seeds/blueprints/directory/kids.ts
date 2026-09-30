import { defineMinistry } from './types';

/** Kids serves children in two Teams. A served Kids block needs 1 Líder + 7 Auxiliares; a Maternal block 1 Líder + 3 Auxiliares. */
export const KIDS = defineMinistry({
  name: 'Kids',
  roles: ['Líder', 'Auxiliar'],
  teams: ['Kids', 'Maternal'],
  roster: [
    // Ministry leaders (2)
    {
      seat: {
        ministryLeader: true,
        roles: ['Líder', 'Auxiliar'],
        teams: [{ team: 'Kids' }, { team: 'Maternal' }],
      },
      people: [
        { name: 'Natália Viana', email: 'natalia.viana@igreja-semente.test' },
        {
          name: 'Otávio Guimarães',
          email: 'otavio.guimaraes@igreja-semente.test',
        },
      ],
    },
    // Kids TeamLeaders (3)
    {
      seat: {
        roles: ['Líder', 'Auxiliar'],
        teams: [{ team: 'Kids', teamLeader: true }],
      },
      people: [
        {
          name: 'Patrícia Cardoso',
          email: 'patricia.cardoso@igreja-semente.test',
        },
        {
          name: 'Ricardo Fernandes',
          email: 'ricardo.fernandes@igreja-semente.test',
        },
        {
          name: 'Sabrina Machado',
          email: 'sabrina.machado@igreja-semente.test',
        },
      ],
    },
    // Kids Líderes (5)
    {
      seat: { roles: ['Líder', 'Auxiliar'], teams: [{ team: 'Kids' }] },
      people: [
        {
          name: 'Thiago Nogueira',
          email: 'thiago.nogueira@igreja-semente.test',
        },
        { name: 'Vanessa Santos', email: 'vanessa.santos@igreja-semente.test' },
        {
          name: 'Vinícius Xavier',
          email: 'vinicius.xavier@igreja-semente.test',
        },
        { name: 'Aline Leal', email: 'aline.leal@igreja-semente.test' },
        { name: 'André Carvalho', email: 'andre.carvalho@igreja-semente.test' },
      ],
    },
    // Kids Auxiliares (80)
    {
      seat: { roles: ['Auxiliar'], teams: [{ team: 'Kids' }] },
      people: [
        {
          name: 'Beatriz Ferreira',
          email: 'beatriz.ferreira@igreja-semente.test',
        },
        { name: 'Caio Martins', email: 'caio.martins@igreja-semente.test' },
        {
          name: 'Camila Oliveira',
          email: 'camila.oliveira@igreja-semente.test',
        },
        { name: 'Diego Silva', email: 'diego.silva@igreja-semente.test' },
        { name: 'Elisa Azevedo', email: 'elisa.azevedo@igreja-semente.test' },
        { name: 'Fábio Pacheco', email: 'fabio.pacheco@igreja-semente.test' },
        {
          name: 'Fernanda Castro',
          email: 'fernanda.castro@igreja-semente.test',
        },
        {
          name: 'Gustavo Freitas',
          email: 'gustavo.freitas@igreja-semente.test',
        },
        {
          name: 'Heloísa Medeiros',
          email: 'heloisa.medeiros@igreja-semente.test',
        },
        { name: 'Igor Pereira', email: 'igor.pereira@igreja-semente.test' },
        { name: 'Juliana Soares', email: 'juliana.soares@igreja-semente.test' },
        {
          name: 'Leonardo Batista',
          email: 'leonardo.batista@igreja-semente.test',
        },
        {
          name: 'Letícia Queiroz',
          email: 'leticia.queiroz@igreja-semente.test',
        },
        {
          name: 'Marcelo Correia',
          email: 'marcelo.correia@igreja-semente.test',
        },
        { name: 'Mariana Gomes', email: 'mariana.gomes@igreja-semente.test' },
        { name: 'Nicolas Mendes', email: 'nicolas.mendes@igreja-semente.test' },
        { name: 'Paula Pinto', email: 'paula.pinto@igreja-semente.test' },
        { name: 'Pedro Souza', email: 'pedro.souza@igreja-semente.test' },
        { name: 'Raquel Campos', email: 'raquel.campos@igreja-semente.test' },
        { name: 'Renato Rezende', email: 'renato.rezende@igreja-semente.test' },
        { name: 'Sofia Costa', email: 'sofia.costa@igreja-semente.test' },
        { name: 'Samuel Lima', email: 'samuel.lima@igreja-semente.test' },
        {
          name: 'Tatiane Monteiro',
          email: 'tatiane.monteiro@igreja-semente.test',
        },
        { name: 'Tiago Ramos', email: 'tiago.ramos@igreja-semente.test' },
        {
          name: 'Valéria Teixeira',
          email: 'valeria.teixeira@igreja-semente.test',
        },
        { name: 'Wesley Cunha', email: 'wesley.cunha@igreja-semente.test' },
        { name: 'Yasmin Almeida', email: 'yasmin.almeida@igreja-semente.test' },
        { name: 'Alice Dias', email: 'alice.dias@igreja-semente.test' },
        { name: 'Arthur Lopes', email: 'arthur.lopes@igreja-semente.test' },
        { name: 'Bianca Moreira', email: 'bianca.moreira@igreja-semente.test' },
        {
          name: 'Cláudio Ribeiro',
          email: 'claudio.ribeiro@igreja-semente.test',
        },
        {
          name: 'Débora Vasconcelos',
          email: 'debora.vasconcelos@igreja-semente.test',
        },
        {
          name: 'Emanuel Fonseca',
          email: 'emanuel.fonseca@igreja-semente.test',
        },
        { name: 'Flávia Barbosa', email: 'flavia.barbosa@igreja-semente.test' },
        {
          name: 'Gilberto Farias',
          email: 'gilberto.farias@igreja-semente.test',
        },
        { name: 'Ingrid Macedo', email: 'ingrid.macedo@igreja-semente.test' },
        {
          name: 'Jéssica Nascimento',
          email: 'jessica.nascimento@igreja-semente.test',
        },
        { name: 'Kaique Rocha', email: 'kaique.rocha@igreja-semente.test' },
        { name: 'Lorena Viana', email: 'lorena.viana@igreja-semente.test' },
        {
          name: 'Márcio Guimarães',
          email: 'marcio.guimaraes@igreja-semente.test',
        },
        { name: 'Nathan Cardoso', email: 'nathan.cardoso@igreja-semente.test' },
        {
          name: 'Priscila Fernandes',
          email: 'priscila.fernandes@igreja-semente.test',
        },
        {
          name: 'Rodrigo Machado',
          email: 'rodrigo.machado@igreja-semente.test',
        },
        {
          name: 'Simone Nogueira',
          email: 'simone.nogueira@igreja-semente.test',
        },
        { name: 'Túlio Santos', email: 'tulio.santos@igreja-semente.test' },
        { name: 'Vitória Xavier', email: 'vitoria.xavier@igreja-semente.test' },
        { name: 'Wagner Leal', email: 'wagner.leal@igreja-semente.test' },
        { name: 'Lívia Carvalho', email: 'livia.carvalho@igreja-semente.test' },
        {
          name: 'Murilo Ferreira',
          email: 'murilo.ferreira@igreja-semente.test',
        },
        {
          name: 'Cecília Martins',
          email: 'cecilia.martins@igreja-semente.test',
        },
        { name: 'Ana Rocha', email: 'ana.rocha@igreja-semente.test' },
        { name: 'Bruno Viana', email: 'bruno.viana@igreja-semente.test' },
        {
          name: 'Carla Guimarães',
          email: 'carla.guimaraes@igreja-semente.test',
        },
        { name: 'Daniel Cardoso', email: 'daniel.cardoso@igreja-semente.test' },
        {
          name: 'Eduarda Fernandes',
          email: 'eduarda.fernandes@igreja-semente.test',
        },
        { name: 'Felipe Machado', email: 'felipe.machado@igreja-semente.test' },
        {
          name: 'Gabriela Nogueira',
          email: 'gabriela.nogueira@igreja-semente.test',
        },
        {
          name: 'Henrique Santos',
          email: 'henrique.santos@igreja-semente.test',
        },
        { name: 'Isabela Xavier', email: 'isabela.xavier@igreja-semente.test' },
        { name: 'João Leal', email: 'joao.leal@igreja-semente.test' },
        {
          name: 'Larissa Carvalho',
          email: 'larissa.carvalho@igreja-semente.test',
        },
        {
          name: 'Mateus Ferreira',
          email: 'mateus.ferreira@igreja-semente.test',
        },
        {
          name: 'Natália Martins',
          email: 'natalia.martins@igreja-semente.test',
        },
        {
          name: 'Otávio Oliveira',
          email: 'otavio.oliveira@igreja-semente.test',
        },
        { name: 'Patrícia Silva', email: 'patricia.silva@igreja-semente.test' },
        {
          name: 'Ricardo Azevedo',
          email: 'ricardo.azevedo@igreja-semente.test',
        },
        {
          name: 'Sabrina Pacheco',
          email: 'sabrina.pacheco@igreja-semente.test',
        },
        { name: 'Thiago Castro', email: 'thiago.castro@igreja-semente.test' },
        {
          name: 'Vanessa Freitas',
          email: 'vanessa.freitas@igreja-semente.test',
        },
        {
          name: 'Vinícius Medeiros',
          email: 'vinicius.medeiros@igreja-semente.test',
        },
        { name: 'Aline Pereira', email: 'aline.pereira@igreja-semente.test' },
        { name: 'André Soares', email: 'andre.soares@igreja-semente.test' },
        {
          name: 'Beatriz Batista',
          email: 'beatriz.batista@igreja-semente.test',
        },
        { name: 'Caio Queiroz', email: 'caio.queiroz@igreja-semente.test' },
        { name: 'Camila Correia', email: 'camila.correia@igreja-semente.test' },
        { name: 'Diego Gomes', email: 'diego.gomes@igreja-semente.test' },
        { name: 'Elisa Mendes', email: 'elisa.mendes@igreja-semente.test' },
        { name: 'Fábio Pinto', email: 'fabio.pinto@igreja-semente.test' },
        { name: 'Fernanda Souza', email: 'fernanda.souza@igreja-semente.test' },
        { name: 'Gustavo Campos', email: 'gustavo.campos@igreja-semente.test' },
      ],
    },
    // Maternal TeamLeaders (2)
    {
      seat: {
        roles: ['Líder', 'Auxiliar'],
        teams: [{ team: 'Maternal', teamLeader: true }],
      },
      people: [
        {
          name: 'Heloísa Rezende',
          email: 'heloisa.rezende@igreja-semente.test',
        },
        { name: 'Igor Costa', email: 'igor.costa@igreja-semente.test' },
      ],
    },
    // Maternal Líderes (3)
    {
      seat: { roles: ['Líder', 'Auxiliar'], teams: [{ team: 'Maternal' }] },
      people: [
        { name: 'Juliana Lima', email: 'juliana.lima@igreja-semente.test' },
        {
          name: 'Leonardo Monteiro',
          email: 'leonardo.monteiro@igreja-semente.test',
        },
        { name: 'Letícia Ramos', email: 'leticia.ramos@igreja-semente.test' },
      ],
    },
    // Maternal Auxiliares (45)
    {
      seat: { roles: ['Auxiliar'], teams: [{ team: 'Maternal' }] },
      people: [
        { name: 'Rafael Moura', email: 'rafael.moura@igreja-semente.test' },
        {
          name: 'Marcelo Teixeira',
          email: 'marcelo.teixeira@igreja-semente.test',
        },
        { name: 'Mariana Cunha', email: 'mariana.cunha@igreja-semente.test' },
        {
          name: 'Nicolas Almeida',
          email: 'nicolas.almeida@igreja-semente.test',
        },
        { name: 'Paula Dias', email: 'paula.dias@igreja-semente.test' },
        { name: 'Pedro Lopes', email: 'pedro.lopes@igreja-semente.test' },
        { name: 'Raquel Moreira', email: 'raquel.moreira@igreja-semente.test' },
        { name: 'Renato Ribeiro', email: 'renato.ribeiro@igreja-semente.test' },
        {
          name: 'Sofia Vasconcelos',
          email: 'sofia.vasconcelos@igreja-semente.test',
        },
        { name: 'Samuel Fonseca', email: 'samuel.fonseca@igreja-semente.test' },
        {
          name: 'Tatiane Barbosa',
          email: 'tatiane.barbosa@igreja-semente.test',
        },
        { name: 'Tiago Farias', email: 'tiago.farias@igreja-semente.test' },
        { name: 'Valéria Macedo', email: 'valeria.macedo@igreja-semente.test' },
        {
          name: 'Wesley Nascimento',
          email: 'wesley.nascimento@igreja-semente.test',
        },
        { name: 'Yasmin Rocha', email: 'yasmin.rocha@igreja-semente.test' },
        { name: 'Alice Viana', email: 'alice.viana@igreja-semente.test' },
        {
          name: 'Arthur Guimarães',
          email: 'arthur.guimaraes@igreja-semente.test',
        },
        { name: 'Bianca Cardoso', email: 'bianca.cardoso@igreja-semente.test' },
        {
          name: 'Cláudio Fernandes',
          email: 'claudio.fernandes@igreja-semente.test',
        },
        { name: 'Débora Machado', email: 'debora.machado@igreja-semente.test' },
        {
          name: 'Emanuel Nogueira',
          email: 'emanuel.nogueira@igreja-semente.test',
        },
        { name: 'Flávia Santos', email: 'flavia.santos@igreja-semente.test' },
        {
          name: 'Gilberto Xavier',
          email: 'gilberto.xavier@igreja-semente.test',
        },
        { name: 'Ingrid Leal', email: 'ingrid.leal@igreja-semente.test' },
        {
          name: 'Jéssica Carvalho',
          email: 'jessica.carvalho@igreja-semente.test',
        },
        {
          name: 'Kaique Ferreira',
          email: 'kaique.ferreira@igreja-semente.test',
        },
        { name: 'Lorena Martins', email: 'lorena.martins@igreja-semente.test' },
        {
          name: 'Márcio Oliveira',
          email: 'marcio.oliveira@igreja-semente.test',
        },
        { name: 'Nathan Silva', email: 'nathan.silva@igreja-semente.test' },
        {
          name: 'Priscila Azevedo',
          email: 'priscila.azevedo@igreja-semente.test',
        },
        {
          name: 'Rodrigo Pacheco',
          email: 'rodrigo.pacheco@igreja-semente.test',
        },
        { name: 'Simone Castro', email: 'simone.castro@igreja-semente.test' },
        { name: 'Túlio Freitas', email: 'tulio.freitas@igreja-semente.test' },
        {
          name: 'Vitória Medeiros',
          email: 'vitoria.medeiros@igreja-semente.test',
        },
        { name: 'Wagner Pereira', email: 'wagner.pereira@igreja-semente.test' },
        { name: 'Lívia Soares', email: 'livia.soares@igreja-semente.test' },
        { name: 'Murilo Batista', email: 'murilo.batista@igreja-semente.test' },
        {
          name: 'Cecília Queiroz',
          email: 'cecilia.queiroz@igreja-semente.test',
        },
        { name: 'Ana Ferreira', email: 'ana.ferreira@igreja-semente.test' },
        { name: 'Bruno Martins', email: 'bruno.martins@igreja-semente.test' },
        { name: 'Carla Oliveira', email: 'carla.oliveira@igreja-semente.test' },
        { name: 'Daniel Silva', email: 'daniel.silva@igreja-semente.test' },
        {
          name: 'Eduarda Azevedo',
          email: 'eduarda.azevedo@igreja-semente.test',
        },
        { name: 'Felipe Pacheco', email: 'felipe.pacheco@igreja-semente.test' },
        {
          name: 'Gabriela Castro',
          email: 'gabriela.castro@igreja-semente.test',
        },
      ],
    },
  ],
});
