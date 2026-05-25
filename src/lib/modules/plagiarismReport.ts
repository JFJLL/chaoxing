export function tokenize(text: string) {
  return Array.from(new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1)));
}

export function buildPlagiarismReport(text: string, corpus: Array<{ source: string; text: string }>) {
  const tokens = tokenize(text);
  const matches = corpus.map((item) => {
    const sourceTokens = tokenize(item.text);
    const overlap = sourceTokens.filter((token) => tokens.includes(token));
    const score = sourceTokens.length ? Math.round((overlap.length / sourceTokens.length) * 100) : 0;
    return {
      source: item.source,
      score,
      text: item.text.slice(0, 160)
    };
  });
  const similarity = Math.max(0, ...matches.map((match) => match.score));
  const riskLevel = similarity >= 65 ? "高" : similarity >= 35 ? "中" : "低";
  return {
    similarity,
    riskLevel,
    matchedPassages: matches.filter((match) => match.score > 0).sort((a, b) => b.score - a.score)
  };
}
