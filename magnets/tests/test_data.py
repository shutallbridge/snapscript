"""Card class and grammar rule data: loaded, and rejected when malformed."""

import copy

import pytest

from magnets import DataError, check

SET = {"left": "head", "right": "open", "top": "line", "bottom": "line"}
GET = {"left": "value", "right": "value", "top": "line", "bottom": "line"}
IF = {"left": "head", "right": "open", "top": "line", "bottom": "block"}

TOY_CLASSES = {
    "set_get": {
        "min_length": 1,
        "flip_pair": True,
        "sides": {"set": {"[set(x)to]": SET}, "get": {"[get(x)]": GET}},
    },
    "block_head": {
        "min_length": 2,
        "sides": {"head": {"[if]": IF, "[repeat]": IF}},
    },
}

TOY_RULES = {
    "roles": {
        "left": ["value", "head"],
        "right": ["open", "value"],
        "top": ["line"],
        "bottom": ["line", "block"],
    },
    "priorities": {"should": 10, "low": 0},
    "horizontal": {
        "connect": {"open": ["value"], "value": ["value"]},
        "forbid": "should",
        "off_line": "low",
    },
    "vertical": [{"upper": "line", "lower": "line", "offset": 0, "verdict": "connect"}],
}


def classes_with(**changes):
    data = copy.deepcopy(TOY_CLASSES)
    for path, value in changes.items():
        *parents, key = path.split("__")
        node = data
        for p in parents:
            node = node[p]
        if value is None:
            del node[key]
        else:
            node[key] = value
    return data


def test_check_uses_the_given_classes_and_rules():
    result = check({}, class_data=TOY_CLASSES, rule_data=TOY_RULES)
    assert set(result.sides) == {"set_get.set", "set_get.get", "block_head.head"}
    assert result.sides["block_head.head"].side.members == ("[if]", "[repeat]")
    on_line = {
        (c.a, c.b): (c.labels[0].kind, c.labels[0].priority)
        for c in result.contacts
        if c.axis == "horizontal" and c.offset == 0
    }
    assert on_line[("set_get.set", "set_get.get")] == ("connect", "must")
    assert on_line[("set_get.get", "block_head.head")] == ("forbid", "should")


def test_bundled_members_resolve_to_one_side_each():
    result = check({})
    assert result.sides["operator.operator"].side.notation == "[+]"
    assert "[root]" in result.sides["receiver_printed.receiver"].side.members
    members = [m for s in result.sides.values() for m in s.side.members]
    assert len(members) == len(set(members))


@pytest.mark.parametrize(
    "classes, message",
    [
        (
            classes_with(block_head__sides={"head": {"[if]": IF, "[repeat]": {**IF, "bottom": "line"}}}),
            "block_head.head: members disagree on roles: [if] has bottom block, [repeat] has bottom line",
        ),
        (
            classes_with(set_get__sides={"set": {"[set(x)to]": SET}}),
            "set_get: a flip pair defines two sides (front and back), not 1",
        ),
        (
            classes_with(set_get__flip_pair=None),
            "set_get: a class that is not a flip pair defines one side, not 2",
        ),
        (
            classes_with(set_get__sides__get={"[get(x)]": {**GET, "left": "cont"}}),
            "set_get.get [get(x)]: left role 'cont' is not one of value, head",
        ),
        (
            classes_with(set_get__sides__get={"[get(x)]": {**GET, "bottom": None}}),
            "set_get.get [get(x)]: bottom role None",
        ),
        (
            classes_with(block_head__sides={"head": {"[set(x)to]": IF}}),
            "[set(x)to] is a member of both set_get.set and block_head.head",
        ),
        (classes_with(block_head__min_length=0), "block_head: `min_length` must be"),
        (classes_with(block_head__colour="red"), "block_head: unknown key(s) colour"),
        (classes_with(block_head__sides={"head": {}}), "block_head.head: expected a mapping of member cards"),
    ],
)
def test_rejects_malformed_classes(classes, message):
    with pytest.raises(DataError) as err:
        check({}, class_data=classes, rule_data=TOY_RULES)
    assert message in str(err.value)


def rules_with(**horizontal):
    data = copy.deepcopy(TOY_RULES)
    data["horizontal"].update(horizontal)
    return data


@pytest.mark.parametrize(
    "rules, message",
    [
        (rules_with(connect={"open": ["value"]}), "right role 'value' is missing"),
        (rules_with(connect={"open": ["value"], "value": ["cont"]}), "unknown left role(s) ['cont']"),
        (rules_with(connect={"open": [], "value": [], "end": []}), "unknown key(s) end"),
        (rules_with(forbid="nice"), "horizontal.forbid: priority 'nice' is not one of should, low"),
        (rules_with(off_line=None), "horizontal.off_line: priority None"),
    ],
)
def test_rejects_malformed_rules(rules, message):
    with pytest.raises(DataError) as err:
        check({}, class_data=TOY_CLASSES, rule_data=rules)
    assert message in str(err.value)


def test_reads_classes_and_rules_from_files(tmp_path):
    import yaml

    (tmp_path / "classes.yaml").write_text(yaml.safe_dump(TOY_CLASSES, allow_unicode=True))
    (tmp_path / "rules.yaml").write_text(yaml.safe_dump(TOY_RULES))
    result = check({}, class_data=tmp_path / "classes.yaml", rule_data=tmp_path / "rules.yaml")
    assert set(result.sides) == {"set_get.set", "set_get.get", "block_head.head"}


def test_missing_data_file(tmp_path):
    with pytest.raises(DataError, match="classes file not found"):
        check({}, class_data=tmp_path / "missing.yaml")
