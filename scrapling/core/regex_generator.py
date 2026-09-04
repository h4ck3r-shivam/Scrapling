"""Regex generation from groups of elements / strings."""

from __future__ import annotations

import re
import os
from typing import Any, List, Optional


def _common_prefix(strings: List[str]) -> str:
    if not strings:
        return ""
    prefix = strings[0]
    for s in strings[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix


def _common_suffix(strings: List[str]) -> str:
    if not strings:
        return ""
    rev = [s[::-1] for s in strings]
    rev_prefix = _common_prefix(rev)
    return rev_prefix[::-1]


def _classify_middle(middles: List[str]) -> str:
    if not middles or all(m == "" for m in middles):
        return ""
    has_empty = any(m == "" for m in middles)
    non_empty = [m for m in middles if m != ""]
    all_digits = all(m.isdigit() for m in non_empty) and non_empty
    all_hex = all(re.fullmatch(r"[0-9a-fA-F]+", m) for m in non_empty) and non_empty and any(re.search(r"[a-fA-F]", m) for m in non_empty)
    all_alnum = all(m.isalnum() for m in non_empty) and non_empty
    all_paths = all("/" in m for m in non_empty) if non_empty else False
    if all_digits:
        lengths = {len(m) for m in non_empty}
        if len(lengths) == 1:
            frag = rf"\d{{{lengths.pop()}}}"
        else:
            frag = r"\d+"
    elif all_hex and len(non_empty) > 1:
        lengths = {len(m) for m in non_empty}
        if len(lengths) == 1:
            frag = rf"[0-9a-fA-F]{{{lengths.pop()}}}"
        else:
            frag = r"[0-9a-fA-F]+"
    elif all_paths:
        frag = r".+?"
    elif all(m.isalpha() for m in non_empty) and non_empty:
        frag = r"[A-Za-z]+"
    elif all_alnum:
        frag = r"\w+"
    else:
        frag = r".*?"
    if has_empty:
        frag = f"(?:{frag})?"
    return frag


def generate_regex(
    values: List[str],
    *,
    anchored: bool = True,
    capture_groups: bool = False,
    escape: bool = True,
) -> str:
    if not values:
        raise ValueError("Need at least one string to generate a regex")
    uniq = list(dict.fromkeys(values))
    if len(uniq) == 1:
        pat = re.escape(uniq[0]) if escape else uniq[0]
        return f"^{pat}$" if anchored else pat
    prefix = _common_prefix(uniq)
    suffix = _common_suffix(uniq)
    if prefix and suffix and len(prefix) + len(suffix) > min(len(s) for s in uniq):
        min_len = min(len(s) for s in uniq)
        max_suffix_len = min_len - len(prefix)
        suffix = suffix[-max_suffix_len:] if max_suffix_len > 0 else ""
    middles: List[str] = []
    for s in uniq:
        start = len(prefix)
        end = len(s) - len(suffix) if suffix else len(s)
        middles.append(s[start:end])
    frag = _classify_middle(middles)

    # Heuristic: avoid overly generic patterns (e.g. ^/p.+?$ or ^[A-Za-z]+$) when
    # the common prefix/suffix is too short and the varying part is generic.
    # In those cases an explicit alternation is more precise.
    if not prefix and not suffix:
        # Use alternation for completely disparate strings (e.g. ["abc","xyz"])
        alts = [re.escape(v) if escape else v for v in uniq]
        alt_pat = "(?:" + "|".join(alts) + ")"
        return f"^{alt_pat}$" if anchored else alt_pat
    if frag in (".*?", ".+?") and len(prefix) < 4 and len(suffix) < 4:
        alts = [re.escape(v) if escape else v for v in uniq]
        alt_pat = "(?:" + "|".join(alts) + ")"
        return f"^{alt_pat}$" if anchored else alt_pat

    if capture_groups and frag:
        frag = f"({frag})"
    parts = []
    if prefix:
        parts.append(re.escape(prefix) if escape else prefix)
    if frag:
        parts.append(frag)
    if suffix:
        parts.append(re.escape(suffix) if escape else suffix)
    pattern = "".join(parts)
    if pattern:
        try:
            rx = re.compile(f"^{pattern}$") if anchored else re.compile(pattern)
            if all(rx.search(v) for v in uniq):
                return f"^{pattern}$" if anchored else pattern
        except re.error:
            pass
    alts = [re.escape(v) if escape else v for v in uniq]
    alt_pat = "(?:" + "|".join(alts) + ")"
    return f"^{alt_pat}$" if anchored else alt_pat


def generate_regex_from_elements(
    selector: Any,
    attribute: str = "href",
    tag: str = "a",
    *,
    css_selector: Optional[str] = None,
    anchored: bool = True,
    capture_groups: bool = False,
) -> str:
    css = css_selector or f'{tag}[{attribute}]'
    try:
        elems = selector.css(css)  # type: ignore
    except Exception:
        elems = []
    values = []
    for elem in elems:
        try:
            v = elem.attrib.get(attribute, "")  # type: ignore
            if v:
                values.append(str(v).strip())
        except Exception:
            continue
    if not values:
        raise ValueError(f"No elements with attribute '{attribute}' found for selector '{css}'")
    return generate_regex(values, anchored=anchored, capture_groups=capture_groups)


generate_pattern = generate_regex
generate_regex_for_attribute = generate_regex_from_elements
create_regex = generate_regex
