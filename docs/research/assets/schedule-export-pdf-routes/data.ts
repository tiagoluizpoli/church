// Throwaway benchmark fixture: an Infantil-sized Schedule (4 weeks, Sunday 3 times + Wednesday,
// 2 Sectors, 10-13 names per service). Writes data.json, consumed by schedule.typ and html.ts.
// Run: bun docs/research/assets/schedule-export-pdf-routes/data.ts

const POOL = ["Ana Beatriz Carvalho Souza", "Maria Eduarda Albuquerque Nogueira", "João Pedro Santos", "Lucas Gabriel Ferreira Lima", "Juliana Ribeiro", "Fernanda Cristina de Oliveira Martins", "Rafael Almeida", "Camila Rodrigues Pereira", "Gabriela Monteiro Castro", "Pedro Henrique Barbosa", "Larissa Teixeira", "Thiago Moreira Cardoso", "Beatriz Lopes", "Mateus Vieira da Silva", "Isabela Duarte Fonseca", "Carlos Eduardo Pinto", "Letícia Ramos", "Daniel Araújo Mendes", "Vitória Cavalcanti", "Felipe Rocha", "Mariana Gomes de Azevedo", "Bruno Correia", "Aline Batista Freitas", "Gustavo Nascimento", "Patrícia Cunha", "Rodrigo Dias Moura", "Tatiane Farias", "André Luiz Machado", "Priscila Campos", "Eduardo Sales", "Natália Antunes Brandão", "Samuel Coelho", "Raquel Medeiros", "Leonardo Prado", "Débora Siqueira Bastos", "Vinícius Tavares", "Sabrina Lacerda", "Marcos Paulo Guimarães", "Helena Viana", "Otávio Rezende", "Conceição Gonçalves", "Inês Brandão"];
let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const pick = (n: number) => {
  const out: string[] = [];
  while (out.length < n) {
    const x = POOL[Math.floor(rnd() * POOL.length)]!;
    if (!out.includes(x)) out.push(x);
  }
  return out;
};
// `bun data.ts long` writes data-long.json: 4 Sectors, so Domingos overflows a page (page-break test)
const long = process.argv[2] === "long";
const SECTORS = [{ name: "Berçário", color: 0 }, { name: "Maternal", color: 1 }, { name: "Primários", color: 2 }, { name: "Juniores", color: 3 }].slice(0, long ? 4 : 2);

type Cell = { names: string[] } | { cancelled: string; rowspan: number } | null; // null = covered by a rowspan
function group(name: string, subtitle: string, cols: { wd: string; dn: string; noEvent?: boolean }[], times: string[], cancelledAt: Record<string, number>) {
  const total = times.length * SECTORS.length;
  const bands = times.map((time, ti) => ({
    time,
    rows: SECTORS.map((s, si) => ({
      sector: s.name,
      color: s.color,
      cells: cols.map((c, ci): Cell => {
        seed = 7 + ti * 101 + ci * 13; // same service -> same draw; slice by Sector so nobody serves twice
        const service = pick(SECTORS.length * 7);
        if (c.noEvent) return ti === 0 && si === 0 ? { cancelled: "Não haverá culto", rowspan: total } : null;
        if (cancelledAt[time] === ci) return si === 0 ? { cancelled: "Cancelado", rowspan: SECTORS.length } : null;
        seed = 3 + ti * 31 + ci * 7 + si;
        return { names: service.slice(si * 7, si * 7 + 5 + Math.floor(rnd() * 3)) }; // 10-13 per service over 2 Sectors
      }),
    })),
  }));
  return { name, subtitle, cols, bands };
}

const data = {
  kicker: "Escala",
  ministry: "Ministério Infantil",
  period: "Novembro 2026",
  range: "1 – 28 nov 2026",
  groups: [
    group("Domingos", "Culto de domingo", [1, 8, 15, 22].map((d) => ({ wd: "dom", dn: `${d} nov` })), ["8h30", "10h30", "18h30"], { "18h30": 3 }),
    group("Quartas", "Oração e lições · Glória a Deus", [4, 11, 18, 25].map((d) => ({ wd: "qua", dn: `${d} nov`, noEvent: d === 18 })), ["19h30–21h00"], {}),
  ],
};
await Bun.write(new URL(long ? "./data-long.json" : "./data.json", import.meta.url), JSON.stringify(data, null, 1));
