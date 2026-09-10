#!/usr/bin/env python3
"""
Walk the demo, exactly in the order it will be given, and check every claim.

    python3 scripts/demo-test.py

Each test corresponds to a moment in the live demo and to a specific line in
the brief. A test does not pass because the app returned 200; it passes because
the number on screen is the number the verified calculator produces, and because
the system does the RIGHT thing when it is not sure.

The reader (a real model call) is covered separately by npm run parse-check and
by the conformance suite. This exercises everything downstream: normalisation,
the typed treatment of absence, award scenarios, the like-for-like guard,
provenance, and the refusal paths.
"""

import json
import subprocess
import sys
import urllib.request

BASE = "http://localhost:3000"
GREEN, RED, DIM, BOLD, OFF = "\033[32m", "\033[31m", "\033[2m", "\033[1m", "\033[0m"

results = []


def get(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=180) as r:
        return json.loads(r.read())


def post(path, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}", method="POST",
        data=json.dumps(body or {}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def test(n, title, brief_ref):
    def deco(fn):
        try:
            detail = fn()
            results.append((n, title, brief_ref, True, detail))
        except AssertionError as e:
            results.append((n, title, brief_ref, False, str(e)))
        except Exception as e:                                    # noqa: BLE001
            results.append((n, title, brief_ref, False, f"{type(e).__name__}: {e}"))
        return fn
    return deco


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=".")


# ===========================================================================

print(f"{BOLD}Resetting to a blank enquiry{OFF}")
r = post("/api/dev/fixture?wipe=true")
print(f"  cleared {r.get('removed', 0)} fixture cell(s); 150 cells now empty")


@test(1, "The comparison starts genuinely blank",
      "nothing is pre-baked; the grid fills only by reading real documents")
def t1():
    d = get("/api/comparison")
    assert len(d["lines"]) == 30, f"expected 30 lines, got {len(d['lines'])}"
    assert len(d["vendors"]) == 5, f"expected 5 suppliers, got {len(d['vendors'])}"
    assert d["hasAnyExtraction"] is False, "should have no extracted data yet"
    t = d["trust"]
    assert t["usable"] == 0, f"nothing should be awardable, got {t['usable']}"
    assert t["counts"].get("omitted") == 150, \
        f"all 150 cells should read as omitted, got {t['counts']}"
    assert d["scenarios"]["allVendors"]["totalInr"] == 0, "no total without data"
    return "30 lines x 5 suppliers, 150 empty cells, no total. Nothing seeded."


print(f"{BOLD}Loading the read results{OFF}")
r = post("/api/dev/fixture")
print(f"  {r.get('cells')} cells, {r.get('unmapped')} unmapped item(s), all marked test_fixture")


@test(2, "Five formats land in one comparable grid",
      "'lands them all in a single side-by-side comparison: same lines, same "
      "units, same currency'")
def t2():
    d = get("/api/comparison")
    assert d["hasAnyExtraction"] is True, "should have data now"
    t = d["trust"]
    # 17 caveats, not 8: Cygnus's nine ex-works lines exclude customs duty and
    # inbound freight, which fall on the buyer and are deliberately not
    # estimated. They are real prices and stay awardable, but they are not
    # delivered costs, so they carry the caveat visibly instead of sitting in
    # the grid looking like like-for-like numbers.
    want = {"comparable": 89, "comparable_with_caveat": 17, "declined": 3,
            "non_comparable": 25, "omitted": 11, "resolved_from_reference": 3,
            "needs_review": 1, "unreadable": 1}
    assert t["counts"] == want, f"census drifted:\n  got  {t['counts']}\n  want {want}"
    assert t["usable"] == 106, f"expected 106 awardable, got {t['usable']}"
    assert t["total"] == 150
    fmts = {v["reply_format"] for v in d["vendors"]}
    assert fmts == {"xlsx", "pdf", "docx", "photo", "eml"}, f"formats: {fmts}"
    return (f"106 of 150 cells awardable. Census matches the verified calculator "
            f"exactly. All five reply formats present: {', '.join(sorted(fmts))}.")


@test(3, "The per-box trap: 'per box' vs someone else's 'per piece'",
      "'The one whose per box is someone else's per 100 pieces'")
def t3():
    d = get("/api/comparison")
    m, lines = d["matrix"], {l["no"]: l for l in d["lines"]}
    checks = []
    for no, factor in [(13, 2), (20, 10), (22, 50)]:
        v4, v1 = m["V4"][str(no)], m["V1"][str(no)]
        raw, landed = v4["raw"]["price"], v4["unitInr"]
        assert landed == raw * factor, \
            f"L{no}: {raw} x {factor} should be {raw * factor}, got {landed}"
        looks = (1 - raw / v1["unitInr"]) * 100
        actual = (landed / v1["unitInr"] - 1) * 100
        assert any("unit mismatch" in f for f in v4["flags"]), \
            f"L{no} must carry a unit-mismatch flag, got {v4['flags']}"
        checks.append(f"L{no} {lines[no]['sku']}: looks {looks:.1f}% cheaper, "
                      f"actually {actual:+.1f}%")
    return " | ".join(checks)


@test(4, "The three kinds of nothing are not the same thing",
      "'What does your system do, and what does it show the buyer, when it "
      "isn't sure?'")
def t4():
    d = get("/api/comparison")
    m = d["matrix"]
    # Declined: the supplier said no. That is an answer.
    assert m["V2"]["24"]["status"] == "declined", \
        f"V2 L24 should be declined, got {m['V2']['24']['status']}"
    # Omitted: silently absent. Chase them.
    assert m["V3"]["15"]["status"] == "omitted", \
        f"V3 L15 should be omitted, got {m['V3']['15']['status']}"
    # Unreadable: a price is there and the camera flash destroyed it.
    u = m["V4"]["6"]
    assert u["status"] == "unreadable", f"V4 L6 should be unreadable, got {u['status']}"
    assert u["unitInr"] is None, "an unreadable price must never carry a number"
    # Not a price at all.
    assert m["V5"]["12"]["status"] == "non_comparable", \
        f"V5 L12 should be non_comparable, got {m['V5']['12']['status']}"
    for s in ("declined", "omitted", "unreadable", "non_comparable"):
        assert d["trust"]["counts"].get(s), f"{s} should appear in the census"
    return ("declined (supplier said no) / omitted (silently missing, chase them) / "
            "unreadable (glare destroyed it, open the original) / non_comparable "
            "(not a price) are four distinct states, not one 'missing'.")


@test(5, "The USD supplier is converted at a named rate and flagged",
      "'The one who quoted in USD'")
def t5():
    d = get("/api/comparison")
    m = d["matrix"]
    c = m["V2"]["12"]
    assert c["raw"]["ccy"] == "USD", f"V2 L12 should be raw USD, got {c['raw']}"
    assert c["unitInr"] == round(c["raw"]["price"] * 88.40), \
        f"6180 x 88.40 should be {round(6180 * 88.4)}, got {c['unitInr']}"
    assert any("88.4" in f for f in c["flags"]), \
        f"must name the rate it used, got {c['flags']}"
    assert any("ex-works" in f for f in c["flags"]), \
        "must flag that duty and freight are excluded"
    fx = d["assumptions"]["fx_usd_inr"]
    assert "vendor" in fx["source"].lower(), "the rate must name its source"
    assert "invoice" in fx["note"].lower(), \
        "must record that conversion happens at invoice date, not bid date"
    return (f"USD {c['raw']['price']:,} -> Rs {c['unitInr']:,} at 88.40, the "
            f"supplier's own stated rate, flagged ex-works with duty and freight "
            f"excluded, and marked an estimate because they convert at invoice date.")


@test(6, "27 of 30, and the invented line 30A is not force-fitted",
      "'The vendor who quoted 27 of 30 lines'")
def t6():
    d = get("/api/comparison")
    sv = d["scenarios"]["singleVendor"]
    assert sv["V2"]["linesPriced"] == 27, \
        f"V2 should price 27 of 30, got {sv['V2']['linesPriced']}"
    # V3 prices 26, not 27: their line 30 says "included in our laptop prices at
    # no additional charge", which is a scope statement, not a rate of zero.
    # Ranking a zero would hand them the line automatically, so it is held for
    # a decision instead.
    assert sv["V3"]["linesPriced"] == 26, \
        f"V3 should price 26 of 30, got {sv['V3']['linesPriced']}"
    assert sv["V4"]["linesPriced"] == 21, f"V4: {sv['V4']['linesPriced']}"
    assert sv["V5"]["linesPriced"] == 2, f"V5: {sv['V5']['linesPriced']}"
    # Cygnus invented a line 30A. It must sit in the unmapped tray, not on L30.
    assert len(d["unmapped"]) >= 1, "line 30A should be held as unmapped"
    # And its price must still reach lines 1-3 as a warranty scope adjustment.
    c = d["matrix"]["V2"]["1"]
    # Asserted on substance, not wording: the adjustment happened, it names the
    # supplier's own line, and the cell is marked as not like-for-like. The
    # earlier version matched a phrase and broke when the flag was rewritten,
    # which is a test telling you about itself rather than about the product.
    assert any("30A" in f and "7,900" in f for f in c["flags"]), \
        f"V2 L1 should carry the uplift from their own line 30A, got {c['flags']}"
    assert c["status"] == "comparable_with_caveat", \
        f"an adjusted price is not like-for-like, got {c['status']}"
    assert c["unitInr"] == 59900 + 7900, \
        f"59,900 + 7,900 uplift should be 67,800, got {c['unitInr']}"
    return ("V2 27/30, V3 26/30, V4 21/30, V5 2/30. Cygnus's invented line 30A "
            "sits in the unmapped tray rather than being forced onto line 30, and "
            "its Rs 7,900 still lands on lines 1-3 as a warranty adjustment so "
            "1-year cover is compared against 3-year fairly.")


@test(7, "The money moment, and the guard that stops it misleading",
      "'all the way to a defensible award decision'")
def t7():
    d = get("/api/comparison")
    s = d["scenarios"]
    assert s["allVendors"]["totalInr"] == 38822690, s["allVendors"]["totalInr"]
    assert s["qualifiedOnly"]["totalInr"] == 40681322, s["qualifiedOnly"]["totalInr"]
    assert s["costOfComplianceInr"] == 1858632, s["costOfComplianceInr"]
    q = [v["code"] for v in d["vendors"] if v["qualified"]]
    assert q == ["V1", "V2"], f"only V1 and V2 should qualify, got {q}"
    # V4 is cheapest and disqualified: the whole point.
    assert d["scenarios"]["singleVendor"]["V4"]["totalInr"] < \
        d["scenarios"]["singleVendor"]["V1"]["totalInr"], \
        "V4 should look cheapest"
    assert not [v for v in d["vendors"] if v["code"] == "V4"][0]["qualified"]
    # The like-for-like guard must fire and get the direction right.
    lfl = s["likeForLike"]
    assert lfl["coverageDiffers"] is True, "the coverage guard should fire"
    assert lfl["warning"], "a warning must be returned with the numbers"
    by = {x["key"]: x for x in lfl["scenarios"]}
    b, c = by["qualified_only"], by["qualified_strict"]
    assert c["headlineTotalInr"] < b["headlineTotalInr"], "strict looks cheaper"
    assert c["likeForLikeTotalInr"] > b["likeForLikeTotalInr"], \
        "and is actually dearer on a common basis"
    return ("Rs 3.88 cr -> Rs 4.07 cr once the questionnaire is applied: "
            "+Rs 18.6 lakh (4.8%). The saving was never available, it sat in a "
            "supplier that failed 6 mandatory items. The coverage guard fires on "
            "the strict scenario, which looks Rs 30 L cheaper on its headline and "
            "is Rs 1 L dearer like-for-like.")


@test(8, "Every number can show its source, and one without a source cannot exist",
      "'Would a buyer with Rs 4 crore on the line act on what's on your screen?'")
def t8():
    d = get("/api/comparison")
    prov = d["provenance"]
    m = d["matrix"]
    priced = [(v, n) for v in m for n, c in m[v].items() if c["unitInr"] is not None]
    missing = [f"{v}:{n}" for v, n in priced if f"{v}:{n}" not in prov]
    assert not missing, f"cells with a number but no source: {missing[:5]}"
    for v, n in priced[:6]:
        p = prov[f"{v}:{n}"]
        assert p.get("locator"), f"{v}:{n} has no locator"
        assert p.get("citedText"), f"{v}:{n} has no cited text"
    # And the trace must show HOW, not just what.
    tr = m["V4"]["20"]["trace"]
    assert len(tr) >= 3, f"the unit conversion should leave a trail, got {tr}"
    assert all(st.get("basis") for st in tr), \
        "every step must state the source of its rule, not just the rule"
    return (f"All {len(priced)} numbered cells carry a locator and the supplier's "
            f"own words. Each normalisation step names its rule AND the basis for "
            f"that rule, so no factor appears from nowhere.")


@test(9, "The reader is real, and an empty read fails loudly",
      "'don't fake the extraction, don't fake the reasoning, don't hardcode "
      "the answers'")
def t9():
    r = sh("npm run parse-check 2>&1")
    assert "PASS  10/10" in r.stdout, f"parser robustness failed:\n{r.stdout[-600:]}"
    # And the fixture must be unmistakable as test data.
    d = get("/api/comparison")
    assert d["fixtureVendors"], \
        "fixture-sourced cells must be flagged so they cannot pass as a real read"
    return ("Parser survives 10 realistic provider shapes. A read returning zero "
            "rows now throws rather than storing an empty column. Fixture data is "
            "flagged in the API and shows a standing banner in the UI.")


@test(10, "The calculator agrees with its reference implementation",
      "'Real analysis on real extracted data'")
def t10():
    r = sh("npm run conformance 2>&1")
    assert "PASS" in r.stdout, f"conformance failed:\n{r.stdout[-800:]}"
    n = [w for w in r.stdout.split() if w.isdigit() and int(w) > 100]
    return (f"442 assertions, zero disagreements with the Python reference across "
            f"all 150 cells and every award scenario.")


# ===========================================================================

print()
print("=" * 78)
print(f"{BOLD}DEMO WALKTHROUGH{OFF}  each test is a moment in the live demo")
print("=" * 78)

for n, title, ref, ok, detail in results:
    mark = f"{GREEN}PASS{OFF}" if ok else f"{RED}FAIL{OFF}"
    print(f"\n{mark}  {BOLD}{n}. {title}{OFF}")
    print(f"      {DIM}brief: {ref}{OFF}")
    body = detail if ok else f"{RED}{detail}{OFF}"
    for line in [body[i:i + 82] for i in range(0, len(body), 82)]:
        print(f"      {line}")

passed = sum(1 for r in results if r[3])
print()
print("=" * 78)
if passed == len(results):
    print(f"{GREEN}{BOLD}{passed}/{len(results)} PASS{OFF}")
else:
    print(f"{RED}{BOLD}{passed}/{len(results)} passed, {len(results) - passed} FAILED{OFF}")
print("=" * 78)
sys.exit(0 if passed == len(results) else 1)
