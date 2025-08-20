export type TemplateVars = Record<string, string | number>;

/**
 * Substitute {{var}} placeholders in a template string with values from vars.
 */
export function applyTemplate(template: string, vars: TemplateVars): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
        const val = vars[key];
        return val === undefined ? '' : String(val);
    });
}

interface RollItem { weight: number; value: string; }

function choose(items: RollItem[], rand: () => number): string {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    const r = rand() * total;
    let acc = 0;
    for (const item of items) {
        acc += item.weight;
        if (r < acc) return item.value;
    }
    return items[items.length - 1].value;
}

/**
 * Evaluate a roll table represented as a Markdown table or fenced block.
 *
 * Markdown table format:
 * | roll | result |
 * | ---  | ------ |
 * | 1-2 | A |
 * | 3 | B |
 *
 * Fenced block format:
 * ```
 * A
 * B
 * ```
 */
export function evaluateRollTable(block: string, rand: () => number = Math.random): string {
    const trimmed = block.trim();
    let items: RollItem[] = [];
    if (trimmed.startsWith('```')) {
        const lines = trimmed.split(/\r?\n/).slice(1, -1);
        items = lines.filter(l => l.trim()).map(l => ({ weight: 1, value: l.trim() }));
    } else {
        const lines = trimmed.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
        if (lines.length >= 2) {
            const dataLines = lines.slice(2); // skip header & separator
            for (const line of dataLines) {
                const cells = line.split('|').slice(1, -1).map(c => c.trim());
                if (cells.length < 2) continue;
                const weightCell = cells[0];
                const valueCell = cells[1];
                let weight = 1;
                if (/^\d+$/.test(weightCell)) {
                    weight = parseInt(weightCell, 10);
                } else if (/^(\d+)-(\d+)$/.test(weightCell)) {
                    const [a, b] = weightCell.split('-').map(n => parseInt(n, 10));
                    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) weight = b - a + 1;
                }
                items.push({ weight, value: valueCell });
            }
        }
    }
    if (!items.length) return '';
    return choose(items, rand);
}

