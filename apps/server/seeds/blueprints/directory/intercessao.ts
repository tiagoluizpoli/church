import { defineMinistry } from './types';

/** Intercessão prays through every gathering; a served block needs 8 Intercessores. */
export const INTERCESSAO = defineMinistry({
  name: 'Intercessão',
  roles: ['Intercessor'],
  teams: [],
  roster: [
    // Ministry leader (1)
    {
      seat: { ministryLeader: true, roles: ['Intercessor'] },
      people: [
        {
          name: 'Henrique Freitas',
          email: 'henrique.freitas@igreja-semente.test',
        },
      ],
    },
    // Intercessores (91)
    {
      seat: { roles: ['Intercessor'] },
      people: [
        {
          name: 'Isabela Medeiros',
          email: 'isabela.medeiros@igreja-semente.test',
        },
        { name: 'João Pereira', email: 'joao.pereira@igreja-semente.test' },
        { name: 'Larissa Soares', email: 'larissa.soares@igreja-semente.test' },
        { name: 'Mateus Batista', email: 'mateus.batista@igreja-semente.test' },
        {
          name: 'Natália Queiroz',
          email: 'natalia.queiroz@igreja-semente.test',
        },
        { name: 'Otávio Correia', email: 'otavio.correia@igreja-semente.test' },
        { name: 'Patrícia Gomes', email: 'patricia.gomes@igreja-semente.test' },
        { name: 'Ricardo Mendes', email: 'ricardo.mendes@igreja-semente.test' },
        { name: 'Sabrina Pinto', email: 'sabrina.pinto@igreja-semente.test' },
        { name: 'Thiago Souza', email: 'thiago.souza@igreja-semente.test' },
        { name: 'Vanessa Campos', email: 'vanessa.campos@igreja-semente.test' },
        {
          name: 'Vinícius Rezende',
          email: 'vinicius.rezende@igreja-semente.test',
        },
        { name: 'Aline Costa', email: 'aline.costa@igreja-semente.test' },
        { name: 'André Lima', email: 'andre.lima@igreja-semente.test' },
        {
          name: 'Beatriz Monteiro',
          email: 'beatriz.monteiro@igreja-semente.test',
        },
        { name: 'Caio Ramos', email: 'caio.ramos@igreja-semente.test' },
        {
          name: 'Camila Teixeira',
          email: 'camila.teixeira@igreja-semente.test',
        },
        { name: 'Diego Cunha', email: 'diego.cunha@igreja-semente.test' },
        { name: 'Elisa Almeida', email: 'elisa.almeida@igreja-semente.test' },
        { name: 'Fábio Dias', email: 'fabio.dias@igreja-semente.test' },
        { name: 'Fernanda Lopes', email: 'fernanda.lopes@igreja-semente.test' },
        {
          name: 'Gustavo Moreira',
          email: 'gustavo.moreira@igreja-semente.test',
        },
        {
          name: 'Heloísa Ribeiro',
          email: 'heloisa.ribeiro@igreja-semente.test',
        },
        {
          name: 'Igor Vasconcelos',
          email: 'igor.vasconcelos@igreja-semente.test',
        },
        {
          name: 'Juliana Fonseca',
          email: 'juliana.fonseca@igreja-semente.test',
        },
        {
          name: 'Leonardo Barbosa',
          email: 'leonardo.barbosa@igreja-semente.test',
        },
        { name: 'Letícia Farias', email: 'leticia.farias@igreja-semente.test' },
        { name: 'Marcelo Macedo', email: 'marcelo.macedo@igreja-semente.test' },
        {
          name: 'Mariana Nascimento',
          email: 'mariana.nascimento@igreja-semente.test',
        },
        { name: 'Nicolas Rocha', email: 'nicolas.rocha@igreja-semente.test' },
        { name: 'Paula Viana', email: 'paula.viana@igreja-semente.test' },
        {
          name: 'Pedro Guimarães',
          email: 'pedro.guimaraes@igreja-semente.test',
        },
        { name: 'Raquel Cardoso', email: 'raquel.cardoso@igreja-semente.test' },
        {
          name: 'Renato Fernandes',
          email: 'renato.fernandes@igreja-semente.test',
        },
        { name: 'Sofia Machado', email: 'sofia.machado@igreja-semente.test' },
        {
          name: 'Samuel Nogueira',
          email: 'samuel.nogueira@igreja-semente.test',
        },
        { name: 'Tatiane Santos', email: 'tatiane.santos@igreja-semente.test' },
        { name: 'Tiago Xavier', email: 'tiago.xavier@igreja-semente.test' },
        { name: 'Valéria Leal', email: 'valeria.leal@igreja-semente.test' },
        {
          name: 'Wesley Carvalho',
          email: 'wesley.carvalho@igreja-semente.test',
        },
        {
          name: 'Yasmin Ferreira',
          email: 'yasmin.ferreira@igreja-semente.test',
        },
        { name: 'Alice Martins', email: 'alice.martins@igreja-semente.test' },
        {
          name: 'Arthur Oliveira',
          email: 'arthur.oliveira@igreja-semente.test',
        },
        { name: 'Bianca Silva', email: 'bianca.silva@igreja-semente.test' },
        {
          name: 'Cláudio Azevedo',
          email: 'claudio.azevedo@igreja-semente.test',
        },
        { name: 'Débora Pacheco', email: 'debora.pacheco@igreja-semente.test' },
        { name: 'Emanuel Castro', email: 'emanuel.castro@igreja-semente.test' },
        { name: 'Flávia Freitas', email: 'flavia.freitas@igreja-semente.test' },
        {
          name: 'Gilberto Medeiros',
          email: 'gilberto.medeiros@igreja-semente.test',
        },
        { name: 'Ingrid Pereira', email: 'ingrid.pereira@igreja-semente.test' },
        { name: 'Jéssica Soares', email: 'jessica.soares@igreja-semente.test' },
        { name: 'Kaique Batista', email: 'kaique.batista@igreja-semente.test' },
        { name: 'Lorena Queiroz', email: 'lorena.queiroz@igreja-semente.test' },
        { name: 'Márcio Correia', email: 'marcio.correia@igreja-semente.test' },
        { name: 'Nathan Gomes', email: 'nathan.gomes@igreja-semente.test' },
        {
          name: 'Priscila Mendes',
          email: 'priscila.mendes@igreja-semente.test',
        },
        { name: 'Rodrigo Pinto', email: 'rodrigo.pinto@igreja-semente.test' },
        { name: 'Simone Souza', email: 'simone.souza@igreja-semente.test' },
        { name: 'Túlio Campos', email: 'tulio.campos@igreja-semente.test' },
        {
          name: 'Vitória Rezende',
          email: 'vitoria.rezende@igreja-semente.test',
        },
        { name: 'Wagner Costa', email: 'wagner.costa@igreja-semente.test' },
        { name: 'Lívia Lima', email: 'livia.lima@igreja-semente.test' },
        {
          name: 'Murilo Monteiro',
          email: 'murilo.monteiro@igreja-semente.test',
        },
        { name: 'Cecília Ramos', email: 'cecilia.ramos@igreja-semente.test' },
        { name: 'Ana Batista', email: 'ana.batista@igreja-semente.test' },
        { name: 'Bruno Queiroz', email: 'bruno.queiroz@igreja-semente.test' },
        { name: 'Carla Correia', email: 'carla.correia@igreja-semente.test' },
        { name: 'Daniel Gomes', email: 'daniel.gomes@igreja-semente.test' },
        { name: 'Eduarda Mendes', email: 'eduarda.mendes@igreja-semente.test' },
        { name: 'Felipe Pinto', email: 'felipe.pinto@igreja-semente.test' },
        { name: 'Gabriela Souza', email: 'gabriela.souza@igreja-semente.test' },
        {
          name: 'Henrique Campos',
          email: 'henrique.campos@igreja-semente.test',
        },
        {
          name: 'Isabela Rezende',
          email: 'isabela.rezende@igreja-semente.test',
        },
        { name: 'João Costa', email: 'joao.costa@igreja-semente.test' },
        { name: 'Larissa Lima', email: 'larissa.lima@igreja-semente.test' },
        {
          name: 'Mateus Monteiro',
          email: 'mateus.monteiro@igreja-semente.test',
        },
        { name: 'Natália Ramos', email: 'natalia.ramos@igreja-semente.test' },
        {
          name: 'Otávio Teixeira',
          email: 'otavio.teixeira@igreja-semente.test',
        },
        { name: 'Patrícia Cunha', email: 'patricia.cunha@igreja-semente.test' },
        {
          name: 'Ricardo Almeida',
          email: 'ricardo.almeida@igreja-semente.test',
        },
        { name: 'Sabrina Dias', email: 'sabrina.dias@igreja-semente.test' },
        { name: 'Thiago Lopes', email: 'thiago.lopes@igreja-semente.test' },
        {
          name: 'Vanessa Moreira',
          email: 'vanessa.moreira@igreja-semente.test',
        },
        {
          name: 'Vinícius Ribeiro',
          email: 'vinicius.ribeiro@igreja-semente.test',
        },
        {
          name: 'Aline Vasconcelos',
          email: 'aline.vasconcelos@igreja-semente.test',
        },
        { name: 'André Fonseca', email: 'andre.fonseca@igreja-semente.test' },
        {
          name: 'Beatriz Barbosa',
          email: 'beatriz.barbosa@igreja-semente.test',
        },
        { name: 'Caio Farias', email: 'caio.farias@igreja-semente.test' },
        { name: 'Camila Macedo', email: 'camila.macedo@igreja-semente.test' },
        {
          name: 'Diego Nascimento',
          email: 'diego.nascimento@igreja-semente.test',
        },
        { name: 'Elisa Rocha', email: 'elisa.rocha@igreja-semente.test' },
      ],
    },
  ],
});
