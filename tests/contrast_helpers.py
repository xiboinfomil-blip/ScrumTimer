"""Rendered WCAG AA text-contrast checks shared by isolated browser suites."""
from pathlib import Path
import json
import tempfile

AXE = Path(__file__).resolve().parents[1] / 'node_modules' / 'axe-core' / 'axe.min.js'


def assert_contrast(page, label):
    page.wait_for_function("document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).every(animation => animation.playState !== 'running')")
    page.evaluate('document.fonts.ready')
    if not page.evaluate('typeof window.axe !== "undefined"'):
        page.add_script_tag(path=str(AXE))
    result = page.evaluate("async () => { const result = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } }); return { violations: result.violations.map(rule => ({ id: rule.id, nodes: rule.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) })), incomplete: result.incomplete.flatMap(rule => rule.nodes.map(node => ({ target: node.target, reason: node.failureSummary }))) }; }")
    assert not result['violations'], (label, result['violations'])
    report = Path(tempfile.gettempdir()) / f'scrum-contrast-{label.lower().replace(" ", "-")}.json'
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS contrast: {label}; {len(result["incomplete"])} manual-review items; report: {report.name}')