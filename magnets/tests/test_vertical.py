"""Top/bottom-edge contacts between lines: A above B, A's bottom edge facing B's top."""

from fractions import Fraction

from helpers import arrangement, check_pairs, over, pair_classes


def test_offsets_are_every_quarter_u_where_the_edges_overlap():
    # set_get is 2U to 6U long, so set over set overlaps for -6 < d < 6.
    result = check_pairs({})
    offsets = {
        c.offset
        for c in result.groups
        if c.axis == "vertical" and (c.a, c.b) == ("set_get.set", "set_get.set")
    }
    assert offsets == {Fraction(k, 4) for k in range(-23, 24)}


def test_contacts_cover_every_ordered_pair_of_sides_including_a_side_with_itself():
    result = check_pairs({})
    pairs = {(c.a, c.b) for c in result.groups if c.axis == "vertical" and c.offset == 0}
    assert pairs == {(a, b) for a in result.sides for b in result.sides}


def test_an_offset_only_occurs_at_lengths_where_the_edges_overlap():
    # Every class is 2U to 6U long. [set{x}to] over [call{f}] @+2 needs set at least 3U long.
    result = check_pairs({}, max_length=6)
    assert over(result, "set_get.set", "define_call.call", 0).lengths == (2, 2)
    assert over(result, "set_get.set", "define_call.call", 0).count == 5 * 5
    assert over(result, "set_get.set", "define_call.call", 2).lengths == (3, 2)
    assert over(result, "set_get.set", "define_call.call", 2).count == 4 * 5
    assert over(result, "set_get.set", "define_call.call", -1).lengths == (2, 2)
    assert over(result, "set_get.set", "define_call.call", 5.75).lengths == (6, 2)
    assert over(result, "set_get.set", "define_call.call", 5.75).count == 5
    assert over(result, "block_head.head", "set_get.set", 0).lengths == (2, 2)
    assert over(result, "block_head.head", "set_get.set", 0).count == 5 * 5


def test_a_class_set_back_to_1u_is_graded_at_1u():
    classes = pair_classes()
    classes["define_call"]["min_length"] = 1
    result = check_pairs({}, class_data=classes, max_length=6)
    # [set{x}to] over a 1U [call{f}] @+1: set is 2U, so the call sits under its second U.
    assert over(result, "set_get.set", "define_call.call", 1).lengths == (2, 1)
    assert over(result, "set_get.set", "define_call.call", 1).count == 5 * 6
    assert over(result, "set_get.set", "define_call.call", -1).lengths == (2, 2)


BOTTOM_ROLES = ("line", "block", "none", "free")
TOP_ROLES = ("line", "dedent", "top_level", "none", "free")
MEANINGFUL = (-1, 0, 1)

# #10's vertical table: (upper bottom, lower top, offset) -> verdict.
CONNECTS = {("line", "line", 0), ("block", "line", 1), ("line", "dedent", -1)}


def grammar_verdict(bottom, top, offset):
    if "free" in (bottom, top):
        return ("ungraded", "info")
    if (bottom, top, offset) in CONNECTS:
        return ("connect", "must")
    if top == "top_level":
        return ("forbid", "nice")
    if (bottom, top, offset) == ("block", "dedent", 0):
        return ("forbid", "nice")  # an empty body
    return ("forbid", "should")


def grammar_labels(contact):
    """Every label but coexist, which depends on more than the facing roles."""
    return {(label.kind, label.priority) for label in contact.labels if label.kind != "coexist"}


def test_every_role_triple_at_a_meaningful_offset_has_exactly_one_verdict():
    result = check_pairs({})
    found: dict[tuple, set] = {}
    for c in result.groups:
        if c.axis == "vertical" and c.offset in MEANINGFUL:
            roles = (result.sides[c.a].side.roles["bottom"], result.sides[c.b].side.roles["top"])
            found.setdefault((*roles, c.offset), set()).update(grammar_labels(c))
    assert found == {
        (bottom, top, d): {grammar_verdict(bottom, top, d)}
        for bottom in BOTTOM_ROLES
        for top in TOP_ROLES
        for d in MEANINGFUL
    }


def test_other_offsets_are_forbid_low_unless_coexist_or_ungraded():
    result = check_pairs({})
    for c in result.groups:
        if c.axis == "vertical" and c.offset not in MEANINGFUL:
            roles = {result.sides[c.a].side.roles["bottom"], result.sides[c.b].side.roles["top"]}
            if "free" in roles:
                assert grammar_labels(c) == {("ungraded", "info")}, c
            elif any(label.kind == "coexist" for label in c.labels):
                assert grammar_labels(c) == set(), c
            else:
                assert grammar_labels(c) == {("forbid", "low")}, c


def test_ungraded_contacts_have_one_info_label():
    contact = over(check_pairs({}), "import.import", "set_get.set", 0)
    [label] = contact.labels
    assert (label.kind, label.priority, label.grade) == ("ungraded", "info", "info")


def kinds(contact):
    return [(label.kind, label.priority) for label in contact.labels]


def test_a_line_head_over_an_inline_card_coexists_two_columns_right_or_more():
    # [set{x}to] over [call{append}] @+1: `[set{x}to][call{f}]` can't be a line,
    # and [call{append}] inline in the next line sits at least 2U right of its 2U line head.
    result = check_pairs({})
    assert kinds(over(result, "set_get.set", "define_call.call", 1)) == [("forbid", "should")]
    # @+2 is off the meaningful offsets, so coexist replaces forbid / low.
    assert kinds(over(result, "set_get.set", "define_call.call", 2)) == [("coexist", "must")]


def test_a_line_head_over_an_inline_card_in_the_same_column_is_forbid_only():
    # [set{x}to] over [none] @0: [set{x}to] can't sit inline and
    # [none] can't head a line, so no legal program puts them so.
    assert kinds(over(check_pairs({}), "set_get.set", "none.none", 0)) == [("forbid", "should")]


def test_two_inline_cards_coexist_at_any_whole_offset():
    result = check_pairs({})
    assert kinds(over(result, "literal.num", "literal.num", 0)) == [("coexist", "must"), ("forbid", "should")]
    # Off the meaningful offsets, coexist replaces forbid / low.
    assert kinds(over(result, "literal.num", "literal.num", 2)) == [("coexist", "must")]
    assert kinds(over(result, "literal.num", "literal.num", 0.5)) == [("forbid", "low")]
    # [call{f}] can head a line and sit inline, so it coexists with [none] @0.
    assert kinds(over(result, "define_call.call", "none.none", 0)) == [
        ("coexist", "must"),
        ("forbid", "should"),
    ]


def test_coexist_appears_exactly_where_the_narrow_rule_says():
    # Every line head is at least 2U long, so an inline card sits at least 2U right of its line head.
    result = check_pairs({})

    def can_head(side):
        return side.roles["top"] in ("line", "dedent", "top_level")

    def inline(side):
        return side.roles["left"] != "head"

    for c in result.groups:
        if c.axis != "vertical":
            continue
        upper, lower = result.sides[c.a].side, result.sides[c.b].side
        bottom, top = upper.roles["bottom"], lower.roles["top"]
        d = c.offset
        expected = (
            d.denominator == 1
            and not {bottom, top} & {"top_level", "free"}
            and (bottom, top, d) not in CONNECTS
            and (
                (can_head(upper) and inline(lower) and d >= (3 if bottom == "block" else 2))
                or (inline(upper) and can_head(lower) and d <= (-3 if top == "dedent" else -1))
                or (inline(upper) and inline(lower))
            )
        )
        assert (("coexist", "must") in kinds(c)) == expected, c


def test_coexist_needs_the_lower_line_head_to_sit_left_of_an_inline_card():
    result = check_pairs({})
    # An inline card over a [dedent] that sits 1U to its right: a [dedent]
    # only ever sits 1U left of the line above it.
    assert ("coexist", "must") not in kinds(over(result, "literal.num", "dedent.dedent", 1))
    # Nothing coexists with a [define] below it.
    assert ("coexist", "must") not in kinds(over(result, "literal.num", "define_call.define", -1))


def test_a_define_or_on_heads_a_line_with_inline_cards_below():
    # The spec's first sketch: a [define] over a 2U [call(…)] line head
    # puts [num{500}] under the [define] @+2, never @+1.
    #   [define{setup}]
    #   [call(p5.createCanvas)][num{500}][num{500}]
    result = check_pairs({})
    assert kinds(over(result, "define_call.define", "literal.num", 1)) == [("forbid", "should")]
    assert kinds(over(result, "define_call.define", "literal.num", 2)) == [("coexist", "must")]
    assert kinds(over(result, "on.on", "literal.num", 2)) == [("coexist", "must")]
    # Still nothing coexists with a [define] or [on] below it.
    assert ("coexist", "must") not in kinds(over(result, "literal.num", "on.on", -2))


def test_an_inline_card_meets_a_line_head_below_one_column_left_when_the_body_is_indented():
    # An inline card can't tell whether its line head indents the next line:
    #   [if][num{1}]
    #     [set{y}to]
    result = check_pairs({})
    assert kinds(over(result, "literal.num", "set_get.set", 0)) == [("forbid", "should")]
    assert kinds(over(result, "literal.num", "set_get.set", -1)) == [("coexist", "must"), ("forbid", "should")]


def test_a_1u_line_head_lets_an_inline_card_sit_1u_right_of_it():
    # With [call{f}] 1U again in the data, `[call{createCanvas}][num{500}]`
    # puts [num{500}] 1U right of the line head, under a [define] @+1.
    classes = pair_classes()
    classes["define_call"]["min_length"] = 1
    result = check_pairs({}, class_data=classes)
    assert kinds(over(result, "define_call.define", "literal.num", 1)) == [("coexist", "must"), ("forbid", "should")]
    assert kinds(over(result, "block_head.head", "literal.num", 2)) == [("coexist", "must")]
    assert kinds(over(result, "literal.num", "dedent.dedent", -2)) == [("coexist", "must")]
    # Block heads are still 2U, so an inline card sits at least 1U right of the
    # next line's head, indented body or not.
    assert kinds(over(result, "literal.num", "set_get.set", 0)) == [("forbid", "should")]
    assert kinds(over(result, "literal.num", "set_get.set", -1)) == [("coexist", "must"), ("forbid", "should")]


def test_the_shortest_line_head_counts_even_when_its_class_is_not_graded():
    # A restricted check still knows a [call{f}] can be 1U and head the next
    # line, so an inline card sits 1U right of it, under a [set{x}to] @+1.
    classes = pair_classes()
    classes["define_call"]["min_length"] = 1
    result = check_pairs({}, class_data=classes, classes=["set_get", "literal"])
    assert ("coexist", "must") in kinds(over(result, "set_get.set", "literal.num", 1))


def test_an_inline_card_meets_a_dedent_below_only_three_columns_left_or_more():
    # The [dedent] sits 1U left of the last body line's head, and an inline
    # card at least 2U right of it:
    #     [set{x}to][num{1}]
    #   [dedent]
    result = check_pairs({})
    assert kinds(over(result, "literal.num", "dedent.dedent", -2)) == [("forbid", "low")]
    assert kinds(over(result, "literal.num", "dedent.dedent", -3)) == [("coexist", "must")]


def test_a_block_head_meets_an_inline_card_below_only_three_columns_right_or_more():
    # The body's line head sits 1U right of [if], and an inline card at
    # least 2U right of that:
    #   [if][bool(true)]
    #     [set{x}to][num{1}]
    result = check_pairs({})
    assert kinds(over(result, "block_head.head", "literal.num", 2)) == [("forbid", "low")]
    assert kinds(over(result, "block_head.head", "literal.num", 3)) == [("coexist", "must")]


def grades(contact):
    return [(label.kind, label.grade) for label in contact.labels]


def test_two_inline_cards_that_repel_fail_coexist():
    # [num{1}] over [num{2}] @0: N/- on N/- repels.
    result = check_pairs(
        arrangement(literal={"top": [("left", 0.25, "N/-")], "bottom": [("left", 0.25, "N/-")]})
    )
    contact = over(result, "literal.num", "literal.num", 0)
    assert contact.result == "repel"
    assert grades(contact) == [("coexist", "FAIL"), ("forbid", "strong")]
    assert (contact, contact.labels[0]) in result.must_failures
    # Both are good for the forbid alone, so only the coexist label fails.
    assert (contact, contact.labels[1]) not in result.must_failures


def test_a_from_right_pocket_only_aligns_at_some_length_pairs():
    # set's bottom and [if]'s top pockets both sit 0.25U from the right
    # end, so @0 they line up only on cards of equal length.
    result = check_pairs(
        arrangement(
            set_get={"bottom": [("right", 0.25, "N/-")]},
            block_head={"top": [("right", 0.25, "S/-")]},
        )
    )
    snapped, missed = sorted(
        (c for c in result.groups if c.axis == "vertical"
         and (c.a, c.b, c.offset) == ("set_get.set", "block_head.head", 0)),
        key=lambda c: c.count,
    )
    assert (snapped.lengths, snapped.count, snapped.result) == ((2, 2), 5, "snap")
    assert grades(snapped) == [("connect", "pass")]
    assert (missed.lengths, missed.count, missed.result) == ((2, 3), 20, "nothing")
    assert grades(missed) == [("connect", "FAIL")]
    # @+1 they line up when set is 1U longer: 3x2, 4x3, 5x4, 6x5.
    indented = [
        c for c in result.groups
        if c.axis == "vertical" and (c.a, c.b, c.offset) == ("set_get.set", "block_head.head", 1) and c.pairs
    ]
    [contact] = indented
    assert (contact.lengths, contact.count, contact.result) == ((3, 2), 4, "snap")
    assert grades(contact) == [("forbid", "leak")]


def test_a_block_heads_indent_pocket_meets_the_body_line_head():
    # [if]'s pocket 1.25U from its left end meets set's at 0.25 when set
    # sits 1U right, as a body line head.
    result = check_pairs(
        arrangement(
            block_head={"bottom": [("left", 1.25, "N/-")]},
            set_get={"top": [("left", 0.25, "S/-")]},
        )
    )
    contact = over(result, "block_head.head", "set_get.set", 1)
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers) == ("N/-", "S/-")
    assert (contact.lengths, contact.count) == ((2, 2), 5 * 5)
    assert grades(contact) == [("connect", "pass")]
    # In the same column the pockets miss each other.
    assert over(result, "block_head.head", "set_get.set", 0).pairs == ()


def test_a_dedent_meets_the_last_body_line_one_column_left():
    # set's bottom pocket at 0.25 meets [dedent]'s top pocket at 1.25 when
    # the [dedent] sits 1U left.
    result = check_pairs(
        arrangement(
            set_get={"bottom": [("left", 0.25, "N/-")]},
            dedent={"top": [("left", 1.25, "S/-")]},
        )
    )
    contact = over(result, "set_get.set", "dedent.dedent", -1)
    assert contact.pairs and contact.result == "snap"
    assert (contact.lengths, contact.count) == ((2, 2), 5 * 5)
    assert grades(contact) == [("connect", "pass")]
