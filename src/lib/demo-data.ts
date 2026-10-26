export const demoPhases = [
  { name: "1ª fase", count: 41 }, { name: "4ª fase", count: 31 },
  { name: "6ª fase", count: 21 }, { name: "8ª fase", count: 24 },
] as const;
export const demoCategories = ["Engenharia de Software", "Desenvolvimento Web", "Banco de Dados", "Redes", "Lógica de Programação"] as const;
const concepts: Record<typeof demoCategories[number], { topic: string; correct: string; wrong: string[] }[]> = {
  "Engenharia de Software": [
    { topic: "reduzir regressões após alterações no código", correct: "Testes automatizados", wrong: ["Remover o controle de versão", "Evitar revisão de código", "Desativar integração contínua"] },
    { topic: "registrar mudanças em versões do projeto", correct: "Controle de versão", wrong: ["Cache de navegador", "Balanceador de carga", "Indexação de banco"] },
    { topic: "validar requisitos com usuários", correct: "Teste de aceitação", wrong: ["Teste de ping", "Compressão de arquivos", "Criptografia simétrica"] },
    { topic: "organizar entregas curtas e revisáveis", correct: "Iterações", wrong: ["Compilação manual", "Duplicação de tarefas", "Ausência de planejamento"] },
    { topic: "registrar decisões de arquitetura", correct: "Documentação técnica", wrong: ["Variável global", "Consulta sem índice", "Senha em texto puro"] },
    { topic: "detectar problemas antes da implantação", correct: "Integração contínua", wrong: ["Mudança direta em produção", "Exclusão dos testes", "Desativação de logs"] },
  ],
  "Desenvolvimento Web": [
    { topic: "descrever a estrutura semântica de uma página", correct: "HTML", wrong: ["DNS", "SQL", "TCP"] },
    { topic: "definir estilos responsivos", correct: "CSS", wrong: ["SMTP", "SQL", "SSH"] },
    { topic: "executar lógica interativa no navegador", correct: "JavaScript", wrong: ["JPEG", "DNS", "HTTP"] },
    { topic: "reduzir scripts perigosos em páginas", correct: "Política de segurança de conteúdo", wrong: ["Desativar HTTPS", "Expor segredos", "Aceitar HTML irrestrito"] },
    { topic: "representar dados estruturados em uma API", correct: "JSON", wrong: ["PNG", "CSS", "TLS"] },
    { topic: "tornar o formulário acessível", correct: "Rótulos associados aos campos", wrong: ["Somente cor", "Texto em imagem", "Campos sem nome"] },
  ],
  "Banco de Dados": [
    { topic: "identificar uma linha de forma única", correct: "Chave primária", wrong: ["Cache", "Rota", "Porta de rede"] },
    { topic: "relacionar duas tabelas", correct: "Chave estrangeira", wrong: ["Função de estilo", "Token CSS", "Cabeçalho HTTP"] },
    { topic: "garantir tudo ou nada em várias operações", correct: "Transação", wrong: ["Arquivo de imagem", "Folha de estilo", "Consulta parcial"] },
    { topic: "acelerar filtros frequentes", correct: "Índice", wrong: ["Tema visual", "Porta serial", "Cookie"] },
    { topic: "evitar repetição desnecessária de dados", correct: "Normalização", wrong: ["Ofuscação", "Renderização", "Compressão"] },
    { topic: "consultar dados com segurança contra injeção", correct: "Parâmetros preparados", wrong: ["Concatenar entrada", "Ignorar validação", "Expor a senha"] },
  ],
  "Redes": [
    { topic: "traduzir nomes de domínio para endereços", correct: "DNS", wrong: ["CSS", "SQL", "SVG"] },
    { topic: "proteger o tráfego de um site", correct: "HTTPS", wrong: ["HTTP sem TLS", "FTP anônimo", "Telnet"] },
    { topic: "entregar pacotes entre redes distintas", correct: "Roteador", wrong: ["Editor de texto", "Compilador", "Planilha"] },
    { topic: "identificar serviços em um mesmo endereço IP", correct: "Porta", wrong: ["Fonte", "Pixel", "Índice"] },
    { topic: "verificar alcance básico de um host", correct: "Ping", wrong: ["CSS", "SELECT", "JOIN"] },
    { topic: "estabelecer conexão confiável orientada a fluxo", correct: "TCP", wrong: ["PNG", "HTML", "JPEG"] },
  ],
  "Lógica de Programação": [
    { topic: "repetir uma instrução enquanto uma condição for verdadeira", correct: "Laço de repetição", wrong: ["Comentário", "Constante", "Arquivo binário"] },
    { topic: "escolher um caminho conforme uma condição", correct: "Estrutura condicional", wrong: ["Índice de banco", "Porta TCP", "Folha de estilo"] },
    { topic: "guardar temporariamente um valor", correct: "Variável", wrong: ["Roteador", "Protocolo", "Imagem"] },
    { topic: "dividir um problema em partes reutilizáveis", correct: "Função", wrong: ["Duplicação", "Senha", "Cookie"] },
    { topic: "percorrer elementos de uma coleção", correct: "Iteração", wrong: ["Criptografia", "Renderização", "Roteamento"] },
    { topic: "interromper recursão infinita", correct: "Caso base", wrong: ["Loop sem condição", "Variável global", "Porta de rede"] },
  ],
};
export function demoParticipantNames() { return demoPhases.flatMap((phase, phaseIndex) => Array.from({ length: phase.count }, (_, index) => ({ phaseName: phase.name, name: `Participante Demo ${String(phaseIndex + 1)}-${String(index + 1).padStart(2, "0")}` }))); }
export function demoRandom(seed: string) { let state = 2166136261; for (const char of seed) { state ^= char.charCodeAt(0); state = Math.imul(state, 16777619); } return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
export function demoQuestions() {
  return demoCategories.flatMap(category => Array.from({ length: 36 }, (_, index) => {
    const concept = concepts[category][index % concepts[category].length];
    const variant = Math.floor(index / concepts[category].length) + 1;
    const difficulty = index % 3 === 0 ? "EASY" as const : index % 3 === 1 ? "MEDIUM" as const : "HARD" as const;
    return { statement: `[Demonstração ${String(variant).padStart(2, "0")}] Em ${category}, qual opção é adequada para ${concept.topic}?`, type: "MULTIPLE_CHOICE" as const, alternatives: [concept.correct, ...concept.wrong], answer: concept.correct, explanation: `${concept.correct} é a opção adequada para ${concept.topic}.`, category, difficulty, points: difficulty === "EASY" ? 10 : difficulty === "MEDIUM" ? 20 : 30, timeSeconds: 30, isActive: true, status: "READY" as const };
  }));
}
export function demoGroupScore(homeRank: number, awayRank: number, groupIndex: number) {
  const winnerHome = homeRank < awayRank;
  const high = 20 + groupIndex * 3 + (3 - Math.max(homeRank, awayRank));
  return winnerHome ? { homeScore: high, awayScore: 5 } : { homeScore: 5, awayScore: high };
}
