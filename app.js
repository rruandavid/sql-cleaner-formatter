const inputEl = document.getElementById("sqlInput");
const outputEl = document.getElementById("sqlOutput");
const processBtn = document.getElementById("processBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const formatStyleEl = document.getElementById("formatStyle");

const normalizeDelphiBreaks = (text) =>
  text
    .replace(/#13#10|#10#13/gi, "\n")
    .replace(/#13|#10/gi, "\n");

const stripBackslashes = (text) => text.replace(/\\/g, "");

const collapseWhitespace = (text) =>
  text
    .replace(/\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const removeOuterQuotes = (chunk) => {
  if (chunk.length < 2) return chunk;
  const first = chunk.at(0);
  const last = chunk.at(-1);
  if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
    const body = chunk.slice(1, -1);
    const unescaped = first === "'" ? body.replace(/''/g, "'") : body.replace(/""/g, '"');
    return unescaped;
  }
  return chunk;
};

const CONNECTOR_ONLY_PATTERN = /^(?:\+|&|\.\.)+$/;

const stripDanglingQuotes = (chunk) => {
  if (!chunk) return chunk;
  const first = chunk.at(0);
  const last = chunk.at(-1);
  const isQuoteChar = (char) => char === "'" || char === '"';
  if (isQuoteChar(first) && !isQuoteChar(last)) {
    return chunk.slice(1);
  }
  if (!isQuoteChar(first) && isQuoteChar(last)) {
    return chunk.slice(0, -1);
  }
  return chunk;
};

const splitFragments = (text) =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(\+|&|\.\.)\s*/, "").replace(/\s*(\+|&|\.\.)$/, ""))
    .map((line) => line.replace(/\s*\/\/.*$/, ""))
    .map(removeOuterQuotes)
    .map(stripDanglingQuotes)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const compact = line.replace(/\s+/g, "");
      return !CONNECTOR_ONLY_PATTERN.test(compact);
    });

const hasCodeArtifacts = (text) => /(\+|&|\.\.)|#13|#10|\\/.test(text);

const cleanSql = (raw) => {
  if (!raw.trim()) return "";
  const normalized = stripBackslashes(normalizeDelphiBreaks(raw));
  if (!hasCodeArtifacts(raw)) {
    return collapseWhitespace(normalized);
  }
  const fragments = splitFragments(normalized);
  if (fragments.length === 0) {
    return collapseWhitespace(normalized);
  }
  return collapseWhitespace(fragments.join(" "));
};

const FORMAT_OPTIONS = Object.freeze({
  readable: {
    language: "sql",
    linesBetweenQueries: 1,
    keywordCase: "upper",
    expressionWidth: 110,
    denseOperators: false,
    indentWidth: 2,
    logicalOperatorNewline: "before",
  },
  compact: {
    language: "sql",
    linesBetweenQueries: 1,
    keywordCase: "upper",
    expressionWidth: 200,
    denseOperators: true,
    indentWidth: 2,
    logicalOperatorNewline: "after",
  },
  minimal: null,
});

const compressEmptyLines = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\n(?:\s*\n)+/g, "\n");

const COMPACT_BREAKERS = [
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP",
  "ORDER",
  "HAVING",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "UNION",
  "CASE",
  "WITH",
];

const isCompactBreakLine = (line) => {
  const upper = line.toUpperCase();
  return COMPACT_BREAKERS.some((kw) => upper === kw || upper.startsWith(`${kw} `));
};

const compactify = (text) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  const merged = lines.reduce((acc, line) => {
    if (isCompactBreakLine(line) || line === ")") {
      acc.push(line);
      return acc;
    }
    if (acc.length === 0) {
      acc.push(line);
      return acc;
    }
    acc[acc.length - 1] = `${acc[acc.length - 1]} ${line}`;
    return acc;
  }, []);
  return merged.join("\n");
};

const processSql = () => {
  const raw = inputEl.value;
  if (!raw.trim()) {
    outputEl.value = "";
    return;
  }
  const cleaned = cleanSql(raw);
  let formatted = cleaned;
  if (cleaned) {
    const preset = FORMAT_OPTIONS[formatStyleEl.value];
    if (preset) {
      try {
        const { format } = window.sqlFormatter ?? {};
        formatted = format ? format(cleaned, preset) : cleaned;
      } catch (e) {
        console.error("Erro ao formatar:", e);
      }
    }
    if (preset) {
      formatted = compressEmptyLines(formatted);
    }
    if (formatStyleEl.value === "compact") {
      formatted = compactify(formatted);
    }
  }
  outputEl.value = formatted;
};

let debounceId;
const scheduleProcess = () => {
  window.clearTimeout(debounceId);
  debounceId = window.setTimeout(processSql, 200);
};

inputEl.addEventListener("input", scheduleProcess);
formatStyleEl.addEventListener("change", processSql);

processBtn.addEventListener("click", processSql);

copyBtn.addEventListener("click", async () => {
  if (!outputEl.value.trim()) return;
  try {
    await navigator.clipboard.writeText(outputEl.value);
    copyBtn.textContent = "Copiado!";
    setTimeout(() => (copyBtn.textContent = "Copiar SQL"), 1500);
  } catch (e) {
    console.error("Não foi possível copiar:", e);
  }
});

resetBtn.addEventListener("click", () => {
  inputEl.value = "";
  outputEl.value = "";
  inputEl.focus();
  processSql();
});


