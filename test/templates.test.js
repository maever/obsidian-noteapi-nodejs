import test from 'node:test';
import assert from 'node:assert/strict';

const { applyTemplate, evaluateRollTable } = await import('../dist/utils/templates.js');

test('applyTemplate substitutes variables', () => {
    const tpl = 'Hello {{ name }}!';
    const res = applyTemplate(tpl, { name: 'World' });
    assert.equal(res, 'Hello World!');
});

test('evaluateRollTable chooses based on weights', () => {
    const table = `| roll | result |\n| --- | --- |\n| 1 | A |\n| 2 | B |`;
    const first = evaluateRollTable(table, () => 0);
    const second = evaluateRollTable(table, () => 0.9);
    assert.equal(first, 'A');
    assert.equal(second, 'B');
    const block = "```\nX\nY\n```";
    const blockRes = evaluateRollTable(block, () => 0.5);
    assert.ok(['X', 'Y'].includes(blockRes));
});
