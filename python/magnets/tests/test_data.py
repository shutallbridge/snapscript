"""Card class and grammar rule data: loaded, and rejected when malformed."""

import copy

import pytest

from magnets import DataError, check

SET = {"left": "head", "right": "open", "top": "line", "bottom": "line"}
GET = {"left": "value", "right": "value", "top": "line", "bottom": "line"}
IF = {"left": "head", "right": "open", "top": "line", "bottom": "block"}

TOY_CLASSES = {
    "set_get": {
        "id": 0,
        "min_length": 2,
        "pocket_reach": 1,
        "flip_pair": True,
        "sides": {"set": {"[set{x}to]": SET}, "get": {"[get{x}]": GET}},
    },
    "block_head": {
        "id": 1,
        "min_length": 2,
        "pocket_reach": 2,
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
    "vertical": {
        "offsets": [-1, 0, 1],
        "connect": [
            {"upper": "line", "lower": "line", "offset": 0},
            {"upper": "block", "lower": "line", "offset": 1},
        ],
        "priorities": [],
        "forbid": "should",
        "off_line": "low",
        "coexist": {"never": [], "line_heads": ["line"], "not_inline": ["head"]},
    },
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
        for c in result.groups
        if c.axis == "horizontal" and c.offset == 0
    }
    assert on_line[("set_get.set", "set_get.get")] == ("connect", "must")
    assert on_line[("set_get.get", "block_head.head")] == ("forbid", "should")


def test_bundled_members_belong_to_one_class_each():
    result = check({})
    assert result.sides["operator.front"].side.notation == "[+]"
    assert result.sides["operator.back"].side.members[1] == "[/]"
    assert "[root]" in result.sides["get.get"].side.members
    assert result.sides["call.call"].side.members == ("[call{f}]",)
    assert not {"call_printed", "receiver_printed"} & {name.split(".")[0] for name in result.sides}
    # Only a flip pair's back may share its front's member, as `[color(…)]` does.
    assert result.sides["color.front"].side.members == result.sides["color.back"].side.members == ("[color(…)]",)
    members = {(name.split(".")[0], m) for name, s in result.sides.items() for m in s.side.members}
    assert len({m for _, m in members}) == len(members)


@pytest.mark.parametrize(
    "classes, message",
    [
        (
            classes_with(block_head__sides={"head": {"[if]": IF, "[repeat]": {**IF, "bottom": "line"}}}),
            "block_head.head: members disagree on roles: [if] has bottom block, [repeat] has bottom line",
        ),
        (
            classes_with(set_get__sides={"set": {"[set{x}to]": SET}}),
            "set_get: a flip pair defines two sides (front and back), not 1",
        ),
        (
            classes_with(set_get__sides__set={"[set{x}to]": SET, "[let{x}to]": SET}),
            "set_get: a flip pair's sides pair their members in order, but set has 2 and get has 1",
        ),
        (
            classes_with(set_get__flip_pair=None),
            "set_get: a class that is not a flip pair defines one side, not 2",
        ),
        (
            classes_with(set_get__sides__get={"[get{x}]": {**GET, "left": "cont"}}),
            "set_get.get [get{x}]: left role 'cont' is not one of value, head",
        ),
        (
            classes_with(set_get__sides__get={"[get{x}]": {**GET, "bottom": None}}),
            "set_get.get [get{x}]: bottom role None",
        ),
        (
            classes_with(block_head__sides={"head": {"[set{x}to]": IF}}),
            "[set{x}to] is a member of both set_get.set and block_head.head",
        ),
        (classes_with(block_head__id=None), "block_head: `id`, the class ID, must be a whole number from 0 to 31"),
        (classes_with(block_head__id=32), "block_head: `id`, the class ID, must be a whole number from 0 to 31"),
        (classes_with(block_head__id=-1), "block_head: `id`, the class ID, must be a whole number from 0 to 31"),
        (classes_with(block_head__id="1"), "block_head: `id`, the class ID, must be a whole number from 0 to 31"),
        (classes_with(block_head__id=0), "set_get and block_head share class ID 0"),
        (classes_with(block_head__min_length=0), "block_head: `min_length` must be"),
        (classes_with(block_head__pocket_reach=None), "block_head: `pocket_reach` must be"),
        (classes_with(block_head__pocket_reach=0), "block_head: `pocket_reach` must be"),
        (classes_with(block_head__pocket_reach=3), "from 1 to `min_length` 2"),
        (classes_with(block_head__color="red"), "block_head: unknown key(s) color"),
        (classes_with(block_head__sides={"head": {}}), "block_head.head: expected a mapping of member cards"),
        (
            classes_with(block_head__sides={"head": {"if": IF}}),
            "block_head.head: member 'if' is not a card in notation, like [get{x}]",
        ),
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


def vertical_with(**vertical):
    data = copy.deepcopy(TOY_RULES)
    data["vertical"].update(vertical)
    return data


LINE_OVER_LINE = {"upper": "line", "lower": "line", "offset": 0}


@pytest.mark.parametrize(
    "rules, message",
    [
        (
            vertical_with(priorities=[{"lower": "line", "priority": "low"}]),
            "rules: vertical: line over line @0 is both connect and forbid",
        ),
        (
            vertical_with(
                priorities=[{"upper": "block", "offset": -1, "priority": "low"}, {"lower": "line", "offset": -1, "priority": "low"}]
            ),
            "rules: vertical.priorities: block over line @-1 matches more than one rule",
        ),
        (
            vertical_with(connect=[{**LINE_OVER_LINE, "offset": 2}]),
            "offset 2 is not one of the vertical offsets",
        ),
        (vertical_with(connect=[{**LINE_OVER_LINE, "lower": "dedent"}]), "lower 'dedent' is not one of the top roles"),
        (vertical_with(connect=[{**LINE_OVER_LINE, "verdict": "connect"}]), "unknown key(s) verdict"),
        (vertical_with(priorities=[{"lower": "line", "priority": "nice"}]), "priority 'nice' is not one of should, low"),
        (vertical_with(coexist=None), "rules: vertical.coexist must be a mapping"),
        (
            vertical_with(coexist={"indents": ["line_head"]}),
            "rules: vertical.coexist.indents must be a list of roles from: block, line",
        ),
        (
            vertical_with(coexist={"outdents": ["block"]}),
            "rules: vertical.coexist.outdents must be a list of roles from: line",
        ),
        (vertical_with(ungraded=["head"]), "rules: vertical.ungraded must be a list of roles from: block, line"),
    ],
)
def test_rejects_malformed_vertical_rules(rules, message):
    with pytest.raises(DataError) as err:
        check({}, class_data=TOY_CLASSES, rule_data=rules)
    assert message in str(err.value)


def test_toy_vertical_rules_grade_the_toy_classes():
    result = check({}, class_data=TOY_CLASSES, rule_data=TOY_RULES)
    labels = {
        (c.a, c.b, c.offset): [(label.kind, label.priority) for label in c.labels]
        for c in result.groups
        if c.axis == "vertical"
    }
    assert labels["block_head.head", "set_get.set", 1] == [("connect", "must")]
    assert labels["set_get.set", "set_get.set", 1] == [("forbid", "should")]
    # Two gets can both sit inline, so get over get @-1 coexists.
    assert labels["set_get.get", "set_get.get", -1] == [("coexist", "must"), ("forbid", "should")]
    # set heads a line at least 2U long, so a get inline in the line above sits at least 2U right of it.
    assert labels["set_get.get", "set_get.set", -1] == [("forbid", "should")]
