"""LLM 响应解析的健壮性：去围栏、救「写了两遍」、补空值、删拖尾逗号、拆数组。"""
import pytest

from app.providers import ProviderError, _balanced_spans, _parse_content, _repair_json


def test_plain_object():
    assert _parse_content('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_strips_code_fence():
    assert _parse_content('```json\n{"a": 1}\n```') == {"a": 1}


def test_unwraps_single_element_array():
    # response_format=json_object 下个别模型把对象包进单元素数组
    assert _parse_content('[{"a": 1}]') == {"a": 1}


def test_recovers_from_doubled_output():
    # 先吐一段坏 JSON，再用围栏重写一份完整的 —— 应取到后者
    raw = '{"a":,  broken...\n\n```json\n{"a": 1, "b": 2}\n```'
    assert _parse_content(raw) == {"a": 1, "b": 2}


def test_repairs_empty_numeric_value():
    # deepseek 高频：数值字段被吐成空值
    assert _parse_content('{"durationMs":, "x": 1}') == {"durationMs": 0, "x": 1}


def test_repairs_trailing_comma():
    assert _parse_content('{"a": 1, "b": 2,}') == {"a": 1, "b": 2}


def test_repair_does_not_touch_strings():
    # 字符串里的 `:,` / `,}` 不能被改动（HTML/CSS 里很常见）
    src = '{"html": "<div style=\\"x\\">a,</div>"}'
    assert _repair_json(src) == src


def test_strips_junk_char_before_number():
    # deepseek 偶尔在数字字段前粘个乱码字（如 島25）→ 应修成 25，且不能误返回嵌套数组
    bad = ('{"title":"t","prerequisites":["a","b"],'
           '"chapters":[{"expectedSeconds":島25,"kind":"hook"}]}')
    r = _parse_content(bad)
    assert isinstance(r, dict)
    assert r["chapters"][0]["expectedSeconds"] == 25
    assert r["prerequisites"] == ["a", "b"]


def test_repairs_non_numeric_value_token():
    # 模型把数值字段写成纯乱码 token（无数字）→ 补 0
    assert _parse_content('{"anchorTimeMs": 𝑥, "durationMs": 400}') == {"anchorTimeMs": 0, "durationMs": 400}


def test_escapes_raw_newline_in_string():
    # html 字符串里有真实换行（非法 JSON）→ 转义后可解析
    assert _parse_content('{"html": "<div>\n  line2</div>"}') == {"html": "<div>\n  line2</div>"}


def test_balanced_spans_ignores_nested_arrays():
    # 外层对象坏掉时，不能把里面合法的嵌套数组当顶层结果
    spans = _balanced_spans('{"a":1,"list":[1,2,3]}')
    assert spans == ['{"a":1,"list":[1,2,3]}']


def test_balanced_spans_extracts_each_object():
    spans = _balanced_spans('noise {"a":1} more [1,2] tail')
    assert '{"a":1}' in spans
    assert "[1,2]" in spans


def test_empty_content_raises():
    with pytest.raises(ProviderError):
        _parse_content("   ")
