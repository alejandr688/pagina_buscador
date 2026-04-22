(function () {
  const config = window.MEDEVIA_SHEET_CONFIG || {};
  const FALLBACK_CSV = window.MEDEVIA_FALLBACK_CSV || "";
  const RESULT_LIMIT = 12;
  const ENTRY_ID_PATTERN = /^MEV-\d+$/i;
  const state = {
    dataset: [],
    filtered: [],
    sourceLabel: "Sin datos",
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    highlightCurrentPage();

    const searchForm = document.getElementById("search-form");
    if (!searchForm) {
      return;
    }

    const elements = {
      searchForm,
      searchInput: document.getElementById("search-input"),
      resultsContainer: document.getElementById("results-container"),
      emptyState: document.getElementById("empty-state"),
      summary: document.getElementById("results-summary"),
      meta: document.getElementById("results-meta"),
      sourceBadge: document.getElementById("data-source-badge"),
    };

    bindEvents(elements);
    await loadDataset(elements);
    runSearch(elements);
  }

  function highlightCurrentPage() {
    const page = document.body.dataset.page;
    const links = document.querySelectorAll(".nav-link");

    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const isMatch =
        (page === "inicio" && href === "index.html") ||
        (page === "articulos" && href === "articulos.html") ||
        (page === "metodologia" && href === "metodologia.html") ||
        (page === "contacto" && href === "contacto.html");

      link.classList.toggle("nav-link--active", isMatch);
    });
  }

  function bindEvents(elements) {
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch(elements);
    });

    ["input", "change"].forEach((eventName) => {
      elements.searchInput.addEventListener(eventName, () => runSearch(elements));
    });
  }

  async function loadDataset(elements) {
    let dataset = [];
    let sourceLabel = "Copia local";

    try {
      if (config.gvizUrl) {
        const liveCsv = await fetchLiveCsv(config.gvizUrl);
        dataset = csvToEntries(liveCsv);
        sourceLabel = "Google Sheets en vivo";
      }
    } catch (error) {
      dataset = [];
    }

    if (!dataset.length) {
      dataset = csvToEntries(FALLBACK_CSV);
      sourceLabel = "Copia local real";
    }

    state.dataset = dataset;
    state.sourceLabel = sourceLabel;
    elements.sourceBadge.textContent = sourceLabel;
  }

  async function fetchLiveCsv(url) {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error("No fue posible leer la hoja");
    }

    const rawText = await response.text();
    const jsonPayload = rawText.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
    const parsed = JSON.parse(jsonPayload);
    const table = parsed.table || {};
    const rows = table.rows || [];
    const headers = (table.cols || []).map((column) => (column.label || "").trim());
    const csvRows = [headers];

    rows.forEach((row) => {
      const values = (row.c || []).map((cell) => {
        const value =
          cell && typeof cell.f === "string"
            ? cell.f
            : cell && cell.v !== null
              ? String(cell.v)
              : "";
        return escapeCsv(value);
      });
      csvRows.push(values);
    });

    return csvRows.map((row) => row.join(",")).join("\r\n");
  }

  function escapeCsv(value) {
    const stringValue = String(value).replace(/\r?\n/g, " ").trim();
    if (/[",]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  function csvToEntries(csvText) {
    if (!csvText) {
      return [];
    }

    const rows = parseCsv(csvText);
    return rows
      .slice(1)
      .map(normalizeRowColumns)
      .filter(Boolean)
      .map(mapRowToEntry)
      .filter(isRenderableEntry);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const nextChar = text[index + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function normalizeRowColumns(row) {
    const cells = row.map((cell) => cleanValue(cell));
    const idIndex = cells.findIndex((cell) => ENTRY_ID_PATTERN.test(cell));

    if (idIndex === -1) {
      return null;
    }

    const isolatedCells = cells.slice(idIndex);
    const nextIdOffset = isolatedCells
      .slice(1)
      .findIndex((cell) => ENTRY_ID_PATTERN.test(cell));
    const trimmed = nextIdOffset === -1 ? isolatedCells : isolatedCells.slice(0, nextIdOffset + 1);

    if (trimmed.length === 10) {
      return trimmed;
    }

    if (trimmed.length < 10) {
      while (trimmed.length < 10) {
        trimmed.push("");
      }
      return trimmed;
    }

    const fixed = new Array(10).fill("");
    fixed[0] = trimmed[0] || "";
    fixed[1] = trimmed[1] || "";
    fixed[2] = trimmed[2] || "";
    fixed[9] = trimmed[trimmed.length - 1] || "";
    fixed[8] = trimmed[trimmed.length - 2] || "";
    fixed[7] = trimmed[trimmed.length - 3] || "";
    fixed[6] = trimmed[trimmed.length - 4] || "";
    fixed[5] = trimmed[trimmed.length - 5] || "";
    fixed[4] = trimmed[trimmed.length - 6] || "";
    fixed[3] = trimmed.slice(3, trimmed.length - 6).join(", ");

    return fixed;
  }

  function mapRowToEntry(row) {
    return {
      id: cleanValue(row[0]),
      nombre: cleanValue(stripEmbeddedRecordTrail(row[1])),
      otrosNombres: cleanValue(stripEmbeddedRecordTrail(row[2])),
      queEs: cleanValue(stripEmbeddedRecordTrail(row[3])),
      riesgos: cleanValue(stripEmbeddedRecordTrail(row[4])),
      conclusiones: cleanValue(stripEmbeddedRecordTrail(row[5])),
      cantidadArticulos: cleanValue(stripEmbeddedRecordTrail(row[6])),
      cantidadRevisiones: cleanValue(stripEmbeddedRecordTrail(row[7])),
      enlacePubMed: cleanValue(stripEmbeddedRecordTrail(row[8])),
      anioReciente: cleanValue(stripEmbeddedRecordTrail(row[9])),
    };
  }

  function isRenderableEntry(entry) {
    if (!ENTRY_ID_PATTERN.test(entry.id)) {
      return false;
    }

    if (!entry.nombre || !/[a-z]/i.test(normalizeText(entry.nombre))) {
      return false;
    }

    return true;
  }

  function cleanValue(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripEmbeddedRecordTrail(value) {
    return String(value || "").replace(/\s*MEV-\d{3},[\s\S]*$/i, "").trim();
  }

  function runSearch(elements) {
    const query = normalizeText(elements.searchInput.value);
    const visibleQuery = cleanValue(elements.searchInput.value);
    const filtered = state.dataset.filter((entry) => matchesQuery(entry, query)).sort(compareEntries);

    state.filtered = filtered;

    const visibleResults = filtered.slice(0, RESULT_LIMIT);
    renderResults(elements, visibleResults, filtered.length, visibleQuery);
  }

  function matchesQuery(entry, query) {
    if (!query) {
      return true;
    }

    const haystack = normalizeText([entry.nombre, entry.otrosNombres, entry.queEs].join(" "));
    return haystack.includes(query);
  }

  function compareEntries(a, b) {
    const yearA = extractYear(a.anioReciente) || 0;
    const yearB = extractYear(b.anioReciente) || 0;

    if (yearA !== yearB) {
      return yearB - yearA;
    }

    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  }

  function renderResults(elements, visibleResults, total, queryLabel) {
    elements.resultsContainer.innerHTML = visibleResults.map(createResultCard).join("");

    const querySuffix = queryLabel ? ` para "${queryLabel}"` : "";

    elements.summary.textContent = total
      ? `Mostrando ${visibleResults.length} de ${total} terapias${querySuffix}.`
      : "No se encontraron terapias con la búsqueda actual.";

    elements.meta.textContent = total
      ? `Ordenado por año de revisión más reciente. Se muestran hasta ${RESULT_LIMIT} resultados.`
      : "Prueba con otro término para encontrar coincidencias.";

    elements.emptyState.hidden = total !== 0;
  }

  function createResultCard(entry) {
    const evidence = formatEvidence(entry.conclusiones);
    const risks = formatOptionalText(entry.riesgos, "No disponible");
    const description = formatOptionalText(entry.queEs, "No disponible");
    const aliases = formatOptionalText(entry.otrosNombres, "No disponible");
    const articleCount = formatOptionalText(entry.cantidadArticulos, "No disponible");
    const reviewCount = formatOptionalText(entry.cantidadRevisiones, "No disponible");
    const yearLabel = formatYear(entry.anioReciente);
    const links = extractUrls(entry.enlacePubMed);

    return `
      <article class="result-card">
        <div class="result-card__top">
          <div class="result-card__title-wrap">
            <span class="result-card__id">${escapeHtml(entry.id || "Sin ID")}</span>
            <h3 class="result-card__title">${escapeHtml(entry.nombre || "Sin nombre")}</h3>
          </div>
          ${evidence.badge}
        </div>

        <div class="result-card__body">
          <p class="result-card__aliases"><strong>Otros nombres:</strong> ${escapeHtml(aliases)}</p>
          <p class="result-card__summary"><strong>¿Qué es?</strong> ${escapeHtml(description)}</p>

          <div class="meta-grid">
            <span class="meta-chip"><strong>Artículos</strong> ${escapeHtml(articleCount)}</span>
            <span class="meta-chip"><strong>Rev. sistemáticas</strong> ${escapeHtml(reviewCount)}</span>
            <span class="meta-chip"><strong>Año reciente</strong> ${escapeHtml(yearLabel)}</span>
          </div>

          <div class="evidence-box">
            <p><strong>Conclusiones / MedTer Light:</strong> ${escapeHtml(evidence.description)}</p>
          </div>

          <div class="risk-box">
            <p><strong>Riesgos asociados:</strong> ${escapeHtml(risks)}</p>
          </div>

          ${
            links.length
              ? `<div class="links-row">${links
                  .map(
                    (link, index) =>
                      `<a class="link-pill" href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">Ver revisión${links.length > 1 ? ` ${index + 1}` : ""}</a>`
                  )
                  .join("")}</div>`
              : `<p class="result-card__summary"><strong>PubMed:</strong> No disponible</p>`
          }
        </div>
      </article>
    `;
  }

  function formatEvidence(value) {
    const cleaned = cleanValue(value);
    const numeric = /^[0-3]$/.test(cleaned) ? Number(cleaned) : null;

    if (numeric !== null) {
      return {
        badge: `<span class="evidence-badge evidence-badge--${numeric}">MedTer Light ${numeric}/3</span>`,
        description: `Nivel ${numeric} en el termómetro de evidencia.`,
      };
    }

    if (!cleaned || cleaned === "-") {
      return {
        badge: '<span class="evidence-badge evidence-badge--na">Sin nivel</span>',
        description: "No disponible",
      };
    }

    return {
      badge: '<span class="evidence-badge evidence-badge--na">Detalle editorial</span>',
      description: cleaned,
    };
  }

  function formatOptionalText(value, fallback) {
    const cleaned = cleanValue(value);
    if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "no tiene") {
      return fallback;
    }
    return cleaned;
  }

  function formatYear(value) {
    const year = extractYear(value);
    if (year) {
      return String(year);
    }

    const cleaned = cleanValue(value);
    if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "no tiene") {
      return "No disponible";
    }

    return cleaned;
  }

  function extractYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  function extractUrls(value) {
    const cleaned = cleanValue(value);
    if (!cleaned || cleaned === "-") {
      return [];
    }

    const matches = cleaned.match(/https?:\/\/[^\s]+/gi) || [];
    return matches.map((link) => link.replace(/[),.;]+$/g, ""));
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
