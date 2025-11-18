// ============================================
// SISTEMA DE ABAS
// ============================================

const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

const switchTab = (targetTab) => {
  tabs.forEach((tab) => {
    const isSelected = tab.dataset.tab === targetTab;
    tab.setAttribute("aria-selected", isSelected);
  });

  tabContents.forEach((content) => {
    const isActive = content.id === `${targetTab}-content`;
    content.setAttribute("data-active", isActive);
  });

  // Salvar aba ativa no localStorage
  localStorage.setItem("activeTab", targetTab);
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
  });
});

// Restaurar aba ativa ao carregar
const savedTab = localStorage.getItem("activeTab") || "sql";
switchTab(savedTab);

// ============================================
// SISTEMA DE TOAST
// ============================================

const toastContainer = document.getElementById("toastContainer");

const showToast = (message, type = "info") => {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || icons.info}</span>
    <span class="toast__message">${message}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
};

// ============================================
// CONTADORES DE LINHAS E CARACTERES
// ============================================

const updateStats = (inputEl, statsEl) => {
  const text = inputEl.value;
  const lines = text.split("\n").length;
  const chars = text.length;
  statsEl.textContent = `${lines} linhas • ${chars} caracteres`;
};

const setupStats = (inputId, statsId) => {
  const input = document.getElementById(inputId);
  const stats = document.getElementById(statsId);
  if (!input || !stats) return;

  input.addEventListener("input", () => updateStats(input, stats));
  updateStats(input, stats);
};

// Configurar contadores para todos os campos
setupStats("sqlInput", "sqlInputStats");
setupStats("sqlOutput", "sqlOutputStats");
setupStats("xmlInput", "xmlInputStats");
setupStats("xmlOutput", "xmlOutputStats");
setupStats("jsonInput", "jsonInputStats");
setupStats("jsonOutput", "jsonOutputStats");

// ============================================
// FORMATADOR SQL (Mantido da versão anterior)
// ============================================

const sqlInputEl = document.getElementById("sqlInput");
const sqlOutputEl = document.getElementById("sqlOutput");
const sqlCopyBtn = document.getElementById("sqlCopyBtn");
const sqlResetBtn = document.getElementById("sqlResetBtn");
const formatStyleEl = document.getElementById("formatStyle");
const caseStyleEl = document.getElementById("caseStyle");

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

const applyCaseTransform = (text, mode) => {
  if (!text) return text;
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    default:
      return text;
  }
};

const processSql = () => {
  const raw = sqlInputEl.value;
  if (!raw.trim()) {
    sqlOutputEl.value = "";
    sqlOutputEl.classList.remove("text-input--error");
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
        console.error("Erro ao formatar SQL:", e);
        sqlOutputEl.classList.add("text-input--error");
        showToast("Erro ao formatar SQL. Verifique a sintaxe.", "error");
        return;
      }
    }
    if (preset) {
      formatted = compressEmptyLines(formatted);
    }
    if (formatStyleEl.value === "compact") {
      formatted = compactify(formatted);
    }
  }
  sqlOutputEl.value = applyCaseTransform(formatted, caseStyleEl.value);
  sqlOutputEl.classList.remove("text-input--error");
  updateStats(sqlOutputEl, document.getElementById("sqlOutputStats"));
  saveToHistory("sql", raw, sqlOutputEl.value);
};

let sqlDebounceId;
const scheduleSqlProcess = () => {
  window.clearTimeout(sqlDebounceId);
  sqlDebounceId = window.setTimeout(processSql, 200);
};

sqlInputEl.addEventListener("input", scheduleSqlProcess);
formatStyleEl.addEventListener("change", processSql);
caseStyleEl.addEventListener("change", processSql);

sqlCopyBtn.addEventListener("click", async () => {
  if (!sqlOutputEl.value.trim()) {
    showToast("Nada para copiar", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(sqlOutputEl.value);
    showToast("SQL copiado com sucesso!", "success");
  } catch (e) {
    console.error("Não foi possível copiar:", e);
    showToast("Erro ao copiar", "error");
  }
});

sqlResetBtn.addEventListener("click", () => {
  sqlInputEl.value = "";
  sqlOutputEl.value = "";
  formatStyleEl.value = "readable";
  caseStyleEl.value = "normal";
  sqlOutputEl.classList.remove("text-input--error");
  updateStats(sqlInputEl, document.getElementById("sqlInputStats"));
  updateStats(sqlOutputEl, document.getElementById("sqlOutputStats"));
  sqlInputEl.focus();
  processSql();
});

// ============================================
// FORMATADOR XML
// ============================================

const xmlInputEl = document.getElementById("xmlInput");
const xmlOutputEl = document.getElementById("xmlOutput");
const xmlCopyBtn = document.getElementById("xmlCopyBtn");
const xmlResetBtn = document.getElementById("xmlResetBtn");
const xmlIndentEl = document.getElementById("xmlIndent");

// Função para traduzir mensagens de erro do XML
const translateXMLError = (errorMsg) => {
  if (!errorMsg) return "XML inválido. Verifique a sintaxe.";
  
  // Traduzir mensagens comuns do DOMParser
  const translations = {
    "Comment must not contain '--'": "Comentário não pode conter '--' (hífen duplo)",
    "Unexpected end tag": "Tag de fechamento inesperada",
    "Unclosed tag": "Tag não fechada",
    "Unexpected token": "Token inesperado",
    "Invalid character": "Caractere inválido",
    "Missing end tag": "Tag de fechamento ausente",
    "Extra content at the end of the document": "Conteúdo extra no final do documento",
    "Premature end of data": "Fim prematuro dos dados",
    "Mismatched tag": "Tag não corresponde",
    "Unterminated": "Não terminado",
    "entity": "entidade",
    "attribute": "atributo",
    "element": "elemento",
    "tag": "tag",
  };
  
  let translated = errorMsg;
  
  // Aplicar traduções
  Object.keys(translations).forEach((key) => {
    const regex = new RegExp(key, "gi");
    translated = translated.replace(regex, translations[key]);
  });
  
  // Traduzir padrões comuns
  translated = translated.replace(/error on line (\d+) at column (\d+)/gi, "erro na linha $1, coluna $2");
  translated = translated.replace(/line (\d+)/gi, "linha $1");
  translated = translated.replace(/column (\d+)/gi, "coluna $1");
  
  return translated.trim() || "XML inválido. Verifique a sintaxe.";
};

const formatXML = (xmlString, indentSize = 2) => {
  if (!xmlString || !xmlString.trim()) return "";

  // Remove espaços extras e quebras de linha desnecessárias
  let formatted = xmlString.trim().replace(/>\s+</g, "><");

  // Tratar comentários XML problemáticos (que contêm '--')
  // Comentários XML válidos: <!-- comentário -->
  // Mas não podem conter '--' no meio
  formatted = formatted.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
    // Se o comentário contém '--', substituir por espaço ou remover
    if (content.includes('--')) {
      // Substituir '--' por ' - ' para tornar válido
      const fixedContent = content.replace(/--/g, ' - ');
      return `<!--${fixedContent}-->`;
    }
    return match;
  });

  // Validação básica de XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(formatted, "text/xml");
  const parseError = xmlDoc.querySelector("parsererror");

  if (parseError) {
    // Extrair mensagem de erro mais limpa
    let errorMsg = parseError.textContent || "Erro desconhecido";
    
    // Limpar mensagem de erro do DOMParser
    errorMsg = errorMsg.replace(/This page contains the following errors:/gi, "");
    errorMsg = errorMsg.replace(/Below is a rendering of the page up to the first error\./gi, "");
    errorMsg = errorMsg.trim();
    
    // Traduzir mensagem de erro para português
    errorMsg = translateXMLError(errorMsg);
    
    throw new Error(errorMsg);
  }

  // Função recursiva para formatar nós
  const formatNode = (node, level = 0) => {
    const indent = " ".repeat(level * indentSize);
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName;
      const attributes = Array.from(node.attributes)
        .map((attr) => ` ${attr.name}="${attr.value}"`)
        .join("");

      const childElements = Array.from(node.childNodes).filter(
        (child) => child.nodeType === Node.ELEMENT_NODE
      );
      const textNodes = Array.from(node.childNodes).filter(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()
      );

      // Elemento vazio
      if (childElements.length === 0 && textNodes.length === 0) {
        return `${indent}<${tagName}${attributes} />\n`;
      }

      // Elemento com apenas texto
      if (childElements.length === 0 && textNodes.length > 0) {
        const textContent = textNodes.map((n) => n.textContent.trim()).join(" ");
        return `${indent}<${tagName}${attributes}>${textContent}</${tagName}>\n`;
      }

      // Elemento com filhos
      let result = `${indent}<${tagName}${attributes}>\n`;
      
      // Adicionar texto antes dos elementos filhos, se houver
      if (textNodes.length > 0) {
        const textContent = textNodes.map((n) => n.textContent.trim()).join(" ");
        result += `${" ".repeat((level + 1) * indentSize)}${textContent}\n`;
      }

      // Formatar elementos filhos
      childElements.forEach((child) => {
        result += formatNode(child, level + 1);
      });

      result += `${indent}</${tagName}>\n`;
      return result;
    }

    return "";
  };

  // Formatar o elemento raiz
  const root = xmlDoc.documentElement;
  const rootTag = root.tagName;
  const rootAttrs = Array.from(root.attributes)
    .map((attr) => ` ${attr.name}="${attr.value}"`)
    .join("");

  const childElements = Array.from(root.childNodes).filter(
    (child) => child.nodeType === Node.ELEMENT_NODE
  );
  const textNodes = Array.from(root.childNodes).filter(
    (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()
  );

  // Raiz vazia
  if (childElements.length === 0 && textNodes.length === 0) {
    return `<${rootTag}${rootAttrs} />\n`;
  }

  // Raiz com apenas texto
  if (childElements.length === 0 && textNodes.length > 0) {
    const textContent = textNodes.map((n) => n.textContent.trim()).join(" ");
    return `<${rootTag}${rootAttrs}>${textContent}</${rootTag}>\n`;
  }

  // Raiz com filhos
  let result = `<${rootTag}${rootAttrs}>\n`;
  
  if (textNodes.length > 0) {
    const textContent = textNodes.map((n) => n.textContent.trim()).join(" ");
    result += `${" ".repeat(indentSize)}${textContent}\n`;
  }

  childElements.forEach((child) => {
    result += formatNode(child, 1);
  });

  result += `</${rootTag}>\n`;
  return result.trim();
};

const processXml = () => {
  const raw = xmlInputEl.value;
  if (!raw.trim()) {
    xmlOutputEl.value = "";
    xmlOutputEl.classList.remove("text-input--error");
    return;
  }

  try {
    const indentSize = parseInt(xmlIndentEl.value, 10);
    const formatted = formatXML(raw, indentSize);
    xmlOutputEl.value = formatted;
    xmlOutputEl.classList.remove("text-input--error");
    updateStats(xmlOutputEl, document.getElementById("xmlOutputStats"));
    saveToHistory("xml", raw, formatted);
  } catch (e) {
    xmlOutputEl.value = `Erro: ${e.message}`;
    xmlOutputEl.classList.add("text-input--error");
    showToast("XML inválido. Verifique a sintaxe.", "error");
  }
};

let xmlDebounceId;
const scheduleXmlProcess = () => {
  window.clearTimeout(xmlDebounceId);
  xmlDebounceId = window.setTimeout(processXml, 300);
};

xmlInputEl.addEventListener("input", scheduleXmlProcess);
xmlIndentEl.addEventListener("change", processXml);

xmlCopyBtn.addEventListener("click", async () => {
  if (!xmlOutputEl.value.trim() || xmlOutputEl.classList.contains("text-input--error")) {
    showToast("Nada para copiar ou XML inválido", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(xmlOutputEl.value);
    showToast("XML copiado com sucesso!", "success");
  } catch (e) {
    console.error("Não foi possível copiar:", e);
    showToast("Erro ao copiar", "error");
  }
});

xmlResetBtn.addEventListener("click", () => {
  xmlInputEl.value = "";
  xmlOutputEl.value = "";
  xmlIndentEl.value = "2";
  xmlOutputEl.classList.remove("text-input--error");
  updateStats(xmlInputEl, document.getElementById("xmlInputStats"));
  updateStats(xmlOutputEl, document.getElementById("xmlOutputStats"));
  xmlInputEl.focus();
  processXml();
});

// ============================================
// FORMATADOR JSON
// ============================================

const jsonInputEl = document.getElementById("jsonInput");
const jsonOutputEl = document.getElementById("jsonOutput");
const jsonCopyBtn = document.getElementById("jsonCopyBtn");
const jsonResetBtn = document.getElementById("jsonResetBtn");
const jsonFormatEl = document.getElementById("jsonFormat");

// Função para traduzir mensagens de erro do JSON
const translateJSONError = (errorMsg) => {
  if (!errorMsg) return "JSON inválido. Verifique a sintaxe.";
  
  // Traduzir mensagens comuns do JSON.parse
  const translations = {
    "Unexpected token": "Token inesperado",
    "Unexpected end of JSON input": "Fim inesperado da entrada JSON",
    "Unexpected string in JSON": "String inesperada no JSON",
    "Unexpected number in JSON": "Número inesperado no JSON",
    "Unexpected boolean in JSON": "Booleano inesperado no JSON",
    "Unexpected null in JSON": "Null inesperado no JSON",
    "Expected property name": "Nome de propriedade esperado",
    "Expected ':'": "Esperado ':'",
    "Expected ',' or '}'": "Esperado ',' ou '}'",
    "Expected ',' or ']'": "Esperado ',' ou ']'",
    "Bad control character": "Caractere de controle inválido",
    "Bad escaped character": "Caractere escapado inválido",
    "Unterminated string": "String não terminada",
    "Unterminated comment": "Comentário não terminado",
    "Invalid number": "Número inválido",
    "No data": "Sem dados",
    "position": "posição",
    "at position": "na posição",
    "at line": "na linha",
    "column": "coluna",
  };
  
  let translated = errorMsg;
  
  // Aplicar traduções
  Object.keys(translations).forEach((key) => {
    const regex = new RegExp(key, "gi");
    translated = translated.replace(regex, translations[key]);
  });
  
  // Traduzir padrões comuns com números
  translated = translated.replace(/at position (\d+)/gi, "na posição $1");
  translated = translated.replace(/at line (\d+)/gi, "na linha $1");
  translated = translated.replace(/column (\d+)/gi, "coluna $1");
  
  return translated.trim() || "JSON inválido. Verifique a sintaxe.";
};

const formatJSON = (jsonString) => {
  if (!jsonString || !jsonString.trim()) return "";

  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    const translatedError = translateJSONError(e.message);
    throw new Error(translatedError);
  }
};

const minifyJSON = (jsonString) => {
  if (!jsonString || !jsonString.trim()) return "";

  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed);
  } catch (e) {
    const translatedError = translateJSONError(e.message);
    throw new Error(translatedError);
  }
};

const processJson = () => {
  const raw = jsonInputEl.value;
  if (!raw.trim()) {
    jsonOutputEl.value = "";
    jsonOutputEl.classList.remove("text-input--error");
    return;
  }

  try {
    const formatType = jsonFormatEl.value;
    let result;
    
    if (formatType === "minified") {
      result = minifyJSON(raw);
    } else {
      result = formatJSON(raw);
    }
    
    jsonOutputEl.value = result;
    jsonOutputEl.classList.remove("text-input--error");
    updateStats(jsonOutputEl, document.getElementById("jsonOutputStats"));
    saveToHistory("json", raw, result);
  } catch (e) {
    jsonOutputEl.value = `Erro: ${e.message}`;
    jsonOutputEl.classList.add("text-input--error");
    showToast("JSON inválido. Verifique a sintaxe.", "error");
  }
};

let jsonDebounceId;
const scheduleJsonProcess = () => {
  window.clearTimeout(jsonDebounceId);
  jsonDebounceId = window.setTimeout(processJson, 300);
};

jsonInputEl.addEventListener("input", scheduleJsonProcess);
jsonFormatEl.addEventListener("change", processJson);

jsonCopyBtn.addEventListener("click", async () => {
  if (!jsonOutputEl.value.trim() || jsonOutputEl.classList.contains("text-input--error")) {
    showToast("Nada para copiar ou JSON inválido", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(jsonOutputEl.value);
    showToast("JSON copiado com sucesso!", "success");
  } catch (e) {
    console.error("Não foi possível copiar:", e);
    showToast("Erro ao copiar", "error");
  }
});

jsonResetBtn.addEventListener("click", () => {
  jsonInputEl.value = "";
  jsonOutputEl.value = "";
  jsonFormatEl.value = "formatted";
  jsonOutputEl.classList.remove("text-input--error");
  updateStats(jsonInputEl, document.getElementById("jsonInputStats"));
  updateStats(jsonOutputEl, document.getElementById("jsonOutputStats"));
  jsonInputEl.focus();
  processJson();
});

// ============================================
// HISTÓRICO LOCAL (localStorage)
// ============================================

const HISTORY_KEY = "formatter_history";
const MAX_HISTORY_ITEMS = 50;

const saveToHistory = (type, input, output) => {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const newEntry = {
      type,
      input,
      output,
      timestamp: Date.now(),
    };

    history.unshift(newEntry);
    if (history.length > MAX_HISTORY_ITEMS) {
      history.pop();
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Erro ao salvar histórico:", e);
  }
};

// Função para limpar histórico (pode ser chamada externamente se necessário)
window.clearFormatterHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
  showToast("Histórico limpo", "info");
};
