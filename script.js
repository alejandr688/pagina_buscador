(function () {
  const config = window.MEDEVIA_SHEET_CONFIG || {};
  const FALLBACK_CSV = window.MEDEVIA_FALLBACK_CSV || "";
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
      minYear: document.getElementById("min-year"),
      maxYear: document.getElementById("max-year"),
      limit: document.getElementById("results-limit"),
      clearButton: document.getElementById("clear-button"),
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
      elements.minYear.addEventListener(eventName, () => runSearch(elements));
      elements.maxYear.addEventListener(eventName, () => runSearch(elements));
      elements.limit.addEventListener(eventName, () => runSearch(elements));
    });

    elements.clearButton.addEventListener("click", () => {
      elements.searchForm.reset();
      elements.limit.value = "12";
      runSearch(elements);
      elements.searchInput.focus();
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
    const jsonPayload = rawText
      .replace(/^[^(]+\(/, "")
      .replace(/\);?\s*$/, "");
    const parsed = JSON.parse(jsonPayload);
    const table = parsed.table || {};
    const rows = table.rows || [];
    const headers = (table.cols || []).map((column) => (column.label || "").trim());

    const csvRows = [headers];

    rows.forEach((row) => {
      const values = (row.c || []).map((cell) => {
        const value = cell && typeof cell.f === "string" ? cell.f : cell && cell.v !== null ? String(cell.v) : "";
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
      .filter((row) => row.some((cell) => normalizeText(cell)))
      .map((row) => mapRowToEntry(normalizeRowColumns(row)))
      .filter((entry) => entry.nombre);
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

  function mapRowToEntry(row) {
    return {
      id: cleanValue(row[0]),
      nombre: cleanValue(row[1]),
      otrosNombres: cleanValue(row[2]),
      queEs: cleanValue(row[3]),
      riesgos: cleanValue(row[4]),
      conclusiones: cleanValue(row[5]),
      cantidadArticulos: cleanValue(row[6]),
      cantidadRevisiones: cleanValue(row[7]),
      enlacePubMed: cleanValue(row[8]),
      anioReciente: cleanValue(row[9]),
    };
  }

  function normalizeRowColumns(row) {
    const cells = [...row];

    if (cells.length === 10) {
      return cells;
    }

    if (cells.length < 10) {
      while (cells.length < 10) {
        cells.push("");
      }
      return cells;
    }

    const fixed = new Array(10).fill("");
    fixed[0] = cells[0] || "";
    fixed[1] = cells[1] || "";
    fixed[2] = cells[2] || "";
    fixed[9] = cells[cells.length - 1] || "";
    fixed[8] = cells[cells.length - 2] || "";
    fixed[7] = cells[cells.length - 3] || "";
    fixed[6] = cells[cells.length - 4] || "";
    fixed[5] = cells[cells.length - 5] || "";
    fixed[4] = cells[cells.length - 6] || "";
    fixed[3] = cells.slice(3, cells.length - 6).join(", ");

    return fixed;
  }

  function cleanValue(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function runSearch(elements) {
    const query = normalizeText(elements.searchInput.value);
    const minYear = parseInteger(elements.minYear.value);
    const maxYear = parseInteger(elements.maxYear.value);
    const limit = parseInteger(elements.limit.value) || 12;

    const filtered = state.dataset
      .filter((entry) => matchesQuery(entry, query))
      .filter((entry) => matchesYearRange(entry, minYear, maxYear))
      .sort(compareEntries);

    state.filtered = filtered;

    const visibleResults = filtered.slice(0, limit);
    renderResults(elements, visibleResults, filtered.length, limit, query, minYear, maxYear);
  }

  function matchesQuery(entry, query) {
    if (!query) {
      return true;
    }

    const haystack = normalizeText([entry.nombre, entry.otrosNombres, entry.queEs].join(" "));
    return haystack.includes(query);
  }

  function matchesYearRange(entry, minYear, maxYear) {
    if (!minYear && !maxYear) {
      return true;
    }

    const year = extractYear(entry.anioReciente);
    if (!year) {
      return false;
    }

    if (minYear && year < minYear) {
      return false;
    }

    if (maxYear && year > maxYear) {
      return false;
    }

    return true;
  }

  function compareEntries(a, b) {
    const yearA = extractYear(a.anioReciente) || 0;
    const yearB = extractYear(b.anioReciente) || 0;

    if (yearA !== yearB) {
      return yearB - yearA;
    }

    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  }

  function renderResults(elements, visibleResults, total, limit, query, minYear, maxYear) {
    elements.resultsContainer.innerHTML = visibleResults.map(createResultCard).join("");

    const filtersLabel = [
      query ? `consulta "${query}"` : "",
      minYear ? `desde ${minYear}` : "",
      maxYear ? `hasta ${maxYear}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    elements.summary.textContent = total
      ? `Mostrando ${visibleResults.length} de ${total} terapias${filtersLabel ? ` para ${filtersLabel}` : ""}.`
      : "No se encontraron terapias con los filtros actuales.";

    elements.meta.textContent = total
      ? `Ordenado por año de revisión más reciente. Límite visual activo: ${limit} resultados.`
      : "Prueba con otro término o amplía el rango de años.";

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

  function parseInteger(value) {
    const stringValue = String(value || "").trim();
    if (!stringValue) {
      return null;
    }

    const parsed = Number.parseInt(stringValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
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
